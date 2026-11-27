import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { resolveOrgRole, isSuperAdmin } from "@/lib/orgGuard";
import { logAudit } from "@/lib/auditLog";
import { checkSamlMetadata, entityIdFromMetadata, tenantIdFromEntraEntityId } from "@/lib/sso/samlClaims";
import { verifyDomainsForTenant } from "@/lib/sso/domainCheck";
import { hasSignInAppConsent } from "@/lib/sso/entraGraph";
import { deleteSamlConnection, describeConnection, isSamlAvailable, jacksonError, saveSamlConnection } from "@/lib/sso/jackson";

// EKP E-12 (A-16): the org's SAML app. super_admin only.
//
// PUT { metadataXml, domains? } uploads the Federation Metadata XML from the
// org's Entra SAML enterprise application.
// - Org already connected ("Connect Microsoft"): the metadata must be for
//   that tenant.
// - Not connected (E-12 follow-up, SAML only, no consent to the KMS Sign-in
//   app): the tenant comes from the metadata, and each email domain in
//   `domains` is proven to be that tenant's through Microsoft's public
//   endpoints (src/lib/sso/domainCheck.js). The org is created set to SAML.
// DELETE removes the SAML app: back to OIDC if the tenant approved the KMS
// Sign-in app, otherwise Microsoft sign-in is removed (nothing else is left).

async function requireSuperAdmin(orgId) {
  const session = await getServerSession();
  if (!session?.user?.email) return { response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const { user, role } = await resolveOrgRole(session.user.email, orgId);
  if (!user) return { response: NextResponse.json({ error: "User not found" }, { status: 404 }) };
  if (!isSuperAdmin(role)) return { response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  if (!isSamlAvailable()) {
    return { response: NextResponse.json({ error: "SAML sign-in isn't configured on this KMS deployment" }, { status: 400 }) };
  }
  const config = await prisma.orgSsoConfig.findUnique({ where: { orgId } });
  return { user, config };
}

async function storeConnection(tenantId, metadataXml) {
  try {
    return { connection: describeConnection(await saveSamlConnection(tenantId, metadataXml)) };
  } catch (err) {
    const { status, message } = jacksonError(err);
    if (status >= 500) console.error("Saving the SAML connection failed:", err);
    return {
      response: NextResponse.json(
        { error: status >= 500 ? "Couldn't save the SAML metadata." : message },
        { status: status >= 500 ? 500 : 400 }
      ),
    };
  }
}

export async function PUT(req, { params }) {
  const { orgId } = await params;
  const { user, config, response } = await requireSuperAdmin(orgId);
  if (response) return response;

  const body = await req.json().catch(() => ({}));
  const metadataXml = String(body.metadataXml || "").trim();

  // Already connected: replace the SAML app of that tenant.
  if (config) {
    const { error } = checkSamlMetadata(metadataXml, config.tenantId);
    if (error) return NextResponse.json({ error }, { status: 400 });
    const saved = await storeConnection(config.tenantId, metadataXml);
    if (saved.response) return saved.response;
    await logAudit({
      orgId,
      actorUserId: user.id,
      action: "sso.saml_configured",
      metadata: { tenantId: config.tenantId, idpEntityId: saved.connection.idpEntityId, certificateValidTo: saved.connection.certificateValidTo },
    });
    return NextResponse.json({ connection: saved.connection });
  }

  // SAML only: the tenant comes from the metadata.
  const tenantId = tenantIdFromEntraEntityId(entityIdFromMetadata(metadataXml));
  const { error } = checkSamlMetadata(metadataXml, tenantId);
  if (error) return NextResponse.json({ error }, { status: 400 });
  const takenBy = await prisma.orgSsoConfig.findUnique({ where: { tenantId }, select: { orgId: true } });
  if (takenBy) {
    return NextResponse.json({ error: "This Microsoft organization is already connected to another KMS organization." }, { status: 409 });
  }
  const { domains, error: domainError } = await verifyDomainsForTenant(body.domains, tenantId);
  if (domainError) return NextResponse.json({ error: domainError }, { status: 400 });

  const saved = await storeConnection(tenantId, metadataXml);
  if (saved.response) return saved.response;
  try {
    await prisma.orgSsoConfig.create({
      data: { orgId, tenantId, protocol: "saml", verifiedDomains: domains, allowedDomains: domains, enabled: true },
    });
  } catch (err) {
    await deleteSamlConnection(tenantId).catch(() => {});
    console.error("Saving the SAML-only setup failed:", err);
    return NextResponse.json({ error: "Couldn't save the SAML setup." }, { status: 500 });
  }
  await logAudit({
    orgId,
    actorUserId: user.id,
    action: "sso.connected",
    metadata: {
      provider: "entra",
      method: "saml_metadata", // no consent to the KMS Sign-in app
      tenantId,
      domains,
      idpEntityId: saved.connection.idpEntityId,
      certificateValidTo: saved.connection.certificateValidTo,
    },
  });
  return NextResponse.json({ connection: saved.connection, connected: true, protocol: "saml" });
}

export async function DELETE(req, { params }) {
  const { orgId } = await params;
  const { user, config, response } = await requireSuperAdmin(orgId);
  if (response) return response;
  if (!config) return NextResponse.json({ error: "Microsoft sign-in isn't set up" }, { status: 404 });

  try {
    await deleteSamlConnection(config.tenantId);
  } catch (err) {
    console.error("Removing the SAML connection failed:", err);
    return NextResponse.json({ error: "Couldn't remove the SAML app." }, { status: 500 });
  }
  const consented = await hasSignInAppConsent(config.tenantId);
  if (consented) {
    if (config.protocol === "saml") await prisma.orgSsoConfig.update({ where: { orgId }, data: { protocol: "oidc" } });
  } else {
    // SAML only: nothing is left to sign in with.
    await prisma.orgSsoConfig.delete({ where: { orgId } });
  }
  await logAudit({
    orgId,
    actorUserId: user.id,
    action: "sso.saml_removed",
    metadata: { tenantId: config.tenantId, protocolBefore: config.protocol, removedSetup: !consented },
  });
  return NextResponse.json(consented ? { connection: null, protocol: "oidc" } : { connected: false });
}
