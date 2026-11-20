import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { resolveOrgRole, isSuperAdmin } from "@/lib/orgGuard";
import { serializeSsoConfig, validateSsoSettingsPatch } from "@/lib/sso/ssoSettings";
import { logAudit } from "@/lib/auditLog";
import { deleteSamlConnection, describeConnection, getSamlConnection, isSamlAvailable, serviceProviderUrls } from "@/lib/sso/jackson";

// EKP A-5: an org's Microsoft sign-in settings. super_admin only.
// E-12: also the SAML part (protocol, the org's SAML connection); the
// metadata upload itself is ./saml/route.js.

// What the page needs to set up SAML: the two values for Entra, and the
// stored connection (or null). Never fails the page: SAML is optional.
async function samlStatus(config) {
  if (!isSamlAvailable()) return { available: false };
  const status = { available: true, ...serviceProviderUrls(), connection: null };
  if (!config) return status;
  try {
    status.connection = describeConnection(await getSamlConnection(config.tenantId));
  } catch (err) {
    console.error("Couldn't read the SAML connection:", err.message);
    status.error = "Couldn't read the SAML connection.";
  }
  return status;
}

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
    saml: await samlStatus(config),
  });
}

export async function PATCH(req, { params }) {
  const { orgId } = await params;
  const { user, response } = await requireSuperAdmin(orgId);
  if (response) return response;

  const config = await prisma.orgSsoConfig.findUnique({ where: { orgId } });
  if (!config) return NextResponse.json({ error: "Microsoft sign-in isn't connected" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const departments = await prisma.department.findMany({ where: { orgId }, select: { id: true } });
  const { data, error } = validateSsoSettingsPatch(body, config, { departmentIds: departments.map((d) => d.id) });
  if (error) return NextResponse.json({ error }, { status: 400 });
  if (data.protocol === "saml") {
    const saml = await samlStatus(config);
    if (!saml.available) return NextResponse.json({ error: "SAML sign-in isn't configured on this KMS deployment" }, { status: 400 });
    if (!saml.connection) return NextResponse.json({ error: "Upload your SAML app's metadata before switching to SAML" }, { status: 400 });
  }

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
  // E-12: the SAML connection goes with it (it's keyed by this tenant).
  if (isSamlAvailable()) {
    await deleteSamlConnection(config.tenantId).catch((err) => console.error("Couldn't remove the SAML connection:", err.message));
  }
  await logAudit({
    orgId,
    actorUserId: user.id,
    action: "sso.disconnected",
    metadata: { provider: "entra", tenantId: config.tenantId, tenantName: config.tenantName },
  });
  return NextResponse.json({ connected: false });
}
