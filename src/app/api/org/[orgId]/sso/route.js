import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { resolveOrgRole, isSuperAdmin } from "@/lib/orgGuard";
import { serializeSsoConfig, validateSsoSettingsPatch } from "@/lib/sso/ssoSettings";
import { logAudit } from "@/lib/auditLog";

// EKP A-5: an org's Microsoft sign-in settings. super_admin only.

async function requireSuperAdmin(orgId) {
  const session = await getServerSession();
  if (!session?.user?.email) return { response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const { user, role } = await resolveOrgRole(session.user.email, orgId);
  if (!user) return { response: NextResponse.json({ error: "User not found" }, { status: 404 }) };
  if (!isSuperAdmin(role)) return { response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  return { user };
}

export async function GET(req, { params }) {
  const { orgId } = await params;
  const { response } = await requireSuperAdmin(orgId);
  if (response) return response;

  const config = await prisma.orgSsoConfig.findUnique({ where: { orgId } });
  return NextResponse.json({
    ...serializeSsoConfig(config),
    available: Boolean(process.env.ENTRA_SSO_CLIENT_ID),
  });
}

export async function PATCH(req, { params }) {
  const { orgId } = await params;
  const { user, response } = await requireSuperAdmin(orgId);
  if (response) return response;

  const config = await prisma.orgSsoConfig.findUnique({ where: { orgId } });
  if (!config) return NextResponse.json({ error: "Microsoft sign-in isn't connected" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const { data, error } = validateSsoSettingsPatch(body, config);
  if (error) return NextResponse.json({ error }, { status: 400 });

  const updated = await prisma.orgSsoConfig.update({ where: { orgId }, data });
  await logAudit({
    orgId,
    actorUserId: user.id,
    action: "sso.updated",
    metadata: {
      before: Object.fromEntries(Object.keys(data).map((k) => [k, config[k]])),
      after: data,
    },
  });
  return NextResponse.json(serializeSsoConfig(updated));
}

export async function DELETE(req, { params }) {
  const { orgId } = await params;
  const { user, response } = await requireSuperAdmin(orgId);
  if (response) return response;

  const config = await prisma.orgSsoConfig.findUnique({ where: { orgId } });
  if (!config) return NextResponse.json({ connected: false });

  // Users and their linked identities are kept: they can sign in with a
  // password (if they have one) and are re-linked on a reconnect.
  await prisma.orgSsoConfig.delete({ where: { orgId } });
  await logAudit({
    orgId,
    actorUserId: user.id,
    action: "sso.disconnected",
    metadata: { provider: "entra", tenantId: config.tenantId, tenantName: config.tenantName },
  });
  return NextResponse.json({ connected: false });
}
