import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { resolveOrgRole, isSuperAdmin } from "@/lib/orgGuard";
import { decryptJson } from "@/lib/crypto";
import { exchangeSsoCode, fetchTenantInfo } from "@/lib/sso/entraAdmin";
import { CONNECT_STATE_MAX_AGE_MS } from "@/lib/sso/ssoSettings";
import { logAudit } from "@/lib/auditLog";

// EKP A-5: Microsoft returns here after the tenant admin approves the KMS
// Sign-in app. Fixed path (registered on the Entra app); the org travels in
// the encrypted `state`. The KMS user finishing the flow must be the
// super_admin who started it.
export async function GET(req) {
  const url = new URL(req.url);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  const code = url.searchParams.get("code");
  const oauthError = url.searchParams.get("error_description") || url.searchParams.get("error");

  let state = null;
  try {
    state = decryptJson(url.searchParams.get("state") || "");
  } catch {
    state = null;
  }
  if (!state?.orgId) return NextResponse.json({ error: "Missing or invalid state" }, { status: 400 });

  const page = `${appUrl}/org/${state.orgId}/integrations/microsoft-sso`;
  const fail = (message) => NextResponse.redirect(`${page}?error=${encodeURIComponent(message)}`);

  if (oauthError) return fail(oauthError.split("\n")[0]);
  if (!code) return fail("Microsoft didn't return an authorization code.");
  if (Date.now() - Number(state.issuedAt) > CONNECT_STATE_MAX_AGE_MS) {
    return fail("The connection request expired. Please try again.");
  }

  const session = await getServerSession();
  if (!session?.user?.email) return NextResponse.redirect(`${appUrl}/auth/signin`);
  const { user, role } = await resolveOrgRole(session.user.email, state.orgId);
  if (!user || user.id !== state.userId || !isSuperAdmin(role)) {
    return fail("Only the super admin who started the connection can finish it.");
  }

  let tenant;
  try {
    tenant = await fetchTenantInfo(await exchangeSsoCode(code));
  } catch (err) {
    return fail(err.message);
  }

  const takenBy = await prisma.orgSsoConfig.findUnique({ where: { tenantId: tenant.tenantId }, select: { orgId: true } });
  if (takenBy && takenBy.orgId !== state.orgId) {
    return fail("This Microsoft organization is already connected to another KMS organization.");
  }

  const existing = await prisma.orgSsoConfig.findUnique({ where: { orgId: state.orgId } });
  const sameTenant = existing?.tenantId === tenant.tenantId;
  // Keep the admin's domain choice on a reconnect to the same tenant, minus
  // any domain the tenant no longer verifies; start with all verified
  // domains for a new or different tenant.
  const allowedDomains = sameTenant
    ? existing.allowedDomains.filter((d) => tenant.verifiedDomains.includes(d))
    : tenant.verifiedDomains;

  await prisma.orgSsoConfig.upsert({
    where: { orgId: state.orgId },
    update: { ...tenant, allowedDomains, enabled: allowedDomains.length > 0 },
    create: { orgId: state.orgId, ...tenant, allowedDomains, enabled: allowedDomains.length > 0 },
  });

  await logAudit({
    orgId: state.orgId,
    actorUserId: user.id,
    action: "sso.connected",
    metadata: { provider: "entra", tenantId: tenant.tenantId, tenantName: tenant.tenantName, previousTenantId: existing?.tenantId ?? null },
  });

  return NextResponse.redirect(`${page}?connected=1`);
}
