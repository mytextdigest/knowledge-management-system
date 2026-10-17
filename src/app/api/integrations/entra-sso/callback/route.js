import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { resolveOrgRole, isSuperAdmin } from "@/lib/orgGuard";
import { decryptJson, encryptJson } from "@/lib/crypto";
import { buildTenantSignInUrl, exchangeSsoCode, fetchTenantInfo } from "@/lib/sso/entraAdmin";
import { CONNECT_STATE_MAX_AGE_MS } from "@/lib/sso/ssoSettings";
import { logAudit } from "@/lib/auditLog";

// EKP A-5: Microsoft returns here twice during "Connect Microsoft" (see
// src/lib/sso/entraAdmin.js): after the tenant admin approves the KMS Sign-in
// app (step "consent": tenant id, no code), then after signing in to that
// tenant (step "signin": a code). Fixed path (registered on the Entra app);
// the org travels in the encrypted `state`. The KMS user finishing the flow
// must be the super_admin who started it.
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
  if (Date.now() - Number(state.issuedAt) > CONNECT_STATE_MAX_AGE_MS) {
    return fail("The connection request expired. Please try again.");
  }

  const session = await getServerSession();
  if (!session?.user?.email) return NextResponse.redirect(`${appUrl}/auth/signin`);
  const { user, role } = await resolveOrgRole(session.user.email, state.orgId);
  if (!user || user.id !== state.userId || !isSuperAdmin(role)) {
    return fail("Only the super admin who started the connection can finish it.");
  }

  // Hop 1 done: the app is approved for `tenant`; now sign in to it.
  if (state.step === "consent") {
    const consentedTenant = url.searchParams.get("tenant");
    if (url.searchParams.get("admin_consent") !== "True" || !consentedTenant) {
      return fail("Microsoft didn't confirm the organization-wide approval.");
    }
    const next = encryptJson({ ...state, step: "signin", tenantId: consentedTenant });
    return NextResponse.redirect(buildTenantSignInUrl({ state: next, tenantId: consentedTenant }));
  }

  if (state.step !== "signin" || !state.tenantId) return fail("Invalid connection state. Please try again.");
  if (!code) return fail("Microsoft didn't return an authorization code.");

  let tenant;
  try {
    tenant = await fetchTenantInfo(await exchangeSsoCode(code, state.tenantId));
  } catch (err) {
    return fail(err.message);
  }
  // The organization read with the token must be the one that approved.
  if (tenant.tenantId !== state.tenantId) {
    return fail("You signed in to a different Microsoft organization than the one that approved KMS.");
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
