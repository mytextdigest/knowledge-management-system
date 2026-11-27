import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { resolveOrgRole, isSuperAdmin } from "@/lib/orgGuard";
import { logAudit } from "@/lib/auditLog";
import { verifyDomainForTenant } from "@/lib/sso/domainCheck";

// EKP E-12 follow-up: POST { domain } adds an email domain to the org's
// Microsoft sign-in, after proving through Microsoft's public endpoints that
// it's a verified domain of the org's tenant (src/lib/sso/domainCheck.js).
// Needed by SAML-only orgs, which have no consent to read the tenant's
// domains from Graph; works for any connected org. super_admin only.

export async function POST(req, { params }) {
  const { orgId } = await params;
  const session = await getServerSession();
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { user, role } = await resolveOrgRole(session.user.email, orgId);
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
  if (!isSuperAdmin(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const config = await prisma.orgSsoConfig.findUnique({ where: { orgId } });
  if (!config) return NextResponse.json({ error: "Microsoft sign-in isn't set up" }, { status: 404 });

  const { domain: input } = await req.json().catch(() => ({}));
  const { domain, error } = await verifyDomainForTenant(input, config.tenantId);
  if (error) return NextResponse.json({ error }, { status: 400 });
  if (config.verifiedDomains.includes(domain)) {
    return NextResponse.json({ error: `${domain} is already listed.` }, { status: 409 });
  }

  const updated = await prisma.orgSsoConfig.update({
    where: { orgId },
    data: {
      verifiedDomains: [...config.verifiedDomains, domain],
      allowedDomains: [...new Set([...config.allowedDomains, domain])],
    },
  });
  await logAudit({ orgId, actorUserId: user.id, action: "sso.domain_added", metadata: { tenantId: config.tenantId, domain } });
  return NextResponse.json({ verifiedDomains: updated.verifiedDomains, allowedDomains: updated.allowedDomains });
}
