// EKP Workstream A, A1 (A-5): which emails must use Microsoft sign-in.
// Used by the sign-in page (email-first redirect), sign-up, and the password
// and one-time-code providers (passwordLogin rule).

import { prisma } from "@/lib/prisma";
import { emailDomain } from "@/lib/sso/entra";
import { isSamlAvailable } from "@/lib/sso/jackson";

// The enabled Microsoft sign-in config whose allowed domains include this
// email's domain, or null. A domain belongs to at most one Microsoft tenant,
// and a tenant to at most one org, so there is at most one match.
export async function findSsoConfigForEmail(email, { db = prisma } = {}) {
  const normalized = String(email || "").trim().toLowerCase();
  if (!normalized.includes("@")) return null;
  return db.orgSsoConfig.findFirst({
    where: { enabled: true, allowedDomains: { has: emailDomain(normalized) } },
  });
}

/**
 * May this user sign in with a KMS password (or one-time code)?
 * Yes unless their email is on a Microsoft sign-in domain whose org keeps
 * passwords for super admins only and they aren't one of that org's super
 * admins (the emergency way in).
 */
export async function isPasswordLoginAllowed(user, { db = prisma } = {}) {
  const config = await findSsoConfigForEmail(user.email, { db });
  if (!config || config.passwordLogin === "all") return true;
  const membership = await db.organizationMember.findUnique({
    where: { orgId_userId: { orgId: config.orgId, userId: user.id } },
    select: { role: true },
  });
  return membership?.role === "super_admin";
}

/**
 * How the sign-in and sign-up pages send this org's users to Microsoft
 * (E-12): { protocol: "saml", samlTenant } for an org set to SAML, else
 * { protocol: "oidc" }. The tenant id is the SAML connection's key; it isn't
 * secret (Microsoft publishes it for any domain).
 */
export function microsoftSignInTarget(config, { samlAvailable = isSamlAvailable() } = {}) {
  if (config?.protocol === "saml" && samlAvailable) return { protocol: "saml", samlTenant: config.tenantId };
  return { protocol: "oidc" };
}
