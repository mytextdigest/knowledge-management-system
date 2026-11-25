import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { resolveOrgRole, isSuperAdmin } from "@/lib/orgGuard";
import { logAudit } from "@/lib/auditLog";
import { checkSamlMetadata } from "@/lib/sso/samlClaims";
import { deleteSamlConnection, describeConnection, isSamlAvailable, jacksonError, saveSamlConnection } from "@/lib/sso/jackson";

// EKP E-12 (A-16): the org's SAML app. PUT uploads the Federation Metadata
// XML from the org's Entra SAML enterprise application; DELETE removes it
// (and switches the org back to OIDC). super_admin only.
//
// The metadata must be Entra's, for the tenant the org connected with
// "Connect Microsoft" (which also proved the verified domains), so an org can
// only add a SAML app of its own Microsoft organization.

async function requireSuperAdmin(orgId) {
  const session = await getServerSession();
  if (!session?.user?.email) return { response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const { user, role } = await resolveOrgRole(session.user.email, orgId);
  if (!user) return { response: NextResponse.json({ error: "User not found" }, { status: 404 }) };
  if (!isSuperAdmin(role)) return { response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  const config = await prisma.orgSsoConfig.findUnique({ where: { orgId } });
  if (!config) return { response: NextResponse.json({ error: "Connect Microsoft first" }, { status: 404 }) };
  if (!isSamlAvailable()) {
    return { response: NextResponse.json({ error: "SAML sign-in isn't configured on this KMS deployment" }, { status: 400 }) };
  }
  return { user, config };
}

export async function PUT(req, { params }) {
  const { orgId } = await params;
  const { user, config, response } = await requireSuperAdmin(orgId);
  if (response) return response;

  const { metadataXml } = await req.json().catch(() => ({}));
  const { error } = checkSamlMetadata(metadataXml, config.tenantId);
  if (error) return NextResponse.json({ error }, { status: 400 });

  let connection;
  try {
    connection = describeConnection(await saveSamlConnection(config.tenantId, String(metadataXml).trim()));
  } catch (err) {
    const { status, message } = jacksonError(err);
    if (status >= 500) console.error("Saving the SAML connection failed:", err);
    return NextResponse.json({ error: status >= 500 ? "Couldn't save the SAML metadata." : message }, { status: status >= 500 ? 500 : 400 });
  }
  await logAudit({
    orgId,
    actorUserId: user.id,
    action: "sso.saml_configured",
    metadata: { tenantId: config.tenantId, idpEntityId: connection.idpEntityId, certificateValidTo: connection.certificateValidTo },
  });
  return NextResponse.json({ connection });
}

export async function DELETE(req, { params }) {
  const { orgId } = await params;
  const { user, config, response } = await requireSuperAdmin(orgId);
  if (response) return response;

  try {
    await deleteSamlConnection(config.tenantId);
  } catch (err) {
    console.error("Removing the SAML connection failed:", err);
    return NextResponse.json({ error: "Couldn't remove the SAML app." }, { status: 500 });
  }
  if (config.protocol === "saml") {
    await prisma.orgSsoConfig.update({ where: { orgId }, data: { protocol: "oidc" } });
  }
  await logAudit({
    orgId,
    actorUserId: user.id,
    action: "sso.saml_removed",
    metadata: { tenantId: config.tenantId, protocolBefore: config.protocol },
  });
  return NextResponse.json({ connection: null, protocol: "oidc" });
}
