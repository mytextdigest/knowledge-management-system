// EKP E-12 follow-up: proving an email domain belongs to a Microsoft tenant
// without the KMS Sign-in app's admin consent, for orgs that set up SAML only.
//
// Two public Microsoft endpoints, no sign-in or consent:
// - https://login.microsoftonline.com/<domain>/v2.0/.well-known/openid-configuration
//   answers with the tenant the domain is verified in (in `issuer`);
// - https://login.microsoftonline.com/getuserrealm.srf?login=x@<domain>&json=1
//   says whether that domain is "Managed" or "Federated" (properly verified)
//   or "Unknown" or viral (a leftover self-service tenant nobody manages).
// Verifying a domain in Entra needs control of its DNS, so "this domain
// resolves to the tenant of the uploaded SAML metadata" proves the same as
// the Graph /organization verifiedDomains check used after consent.
//
// Relative imports only: also used by scripts and tests.

const LOGIN = "https://login.microsoftonline.com";

/** The tenant of personal Microsoft accounts (outlook.com, hotmail.com, ...). */
export const CONSUMER_TENANT_ID = "9188040d-6c67-4c5b-b112-36a304b66dad";

// Shared consumer domains are never an organization's.
const CONSUMER_DOMAINS = new Set([
  "outlook.com", "hotmail.com", "live.com", "msn.com", "passport.com",
  "gmail.com", "googlemail.com", "yahoo.com", "icloud.com", "me.com", "aol.com", "proton.me", "protonmail.com",
]);

const DOMAIN_RE = /^(?=.{3,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

/** The domain, lower-cased and trimmed (an email or "@domain" also works), or null if invalid. */
export function normalizeDomain(input) {
  let value = String(input || "").trim().toLowerCase();
  if (value.includes("@")) value = value.slice(value.lastIndexOf("@") + 1);
  value = value.replace(/\.$/, "");
  return DOMAIN_RE.test(value) ? value : null;
}

async function getJson(fetchImpl, url) {
  const res = await fetchImpl(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(10_000) });
  return res.json().catch(() => ({}));
}

/** The tenant id a domain is registered to in Microsoft Entra, or null. */
export async function lookupDomainTenant(domain, { fetchImpl = fetch } = {}) {
  const data = await getJson(fetchImpl, `${LOGIN}/${encodeURIComponent(domain)}/v2.0/.well-known/openid-configuration`);
  const match = /^https:\/\/login\.microsoftonline\.com\/([0-9a-f-]{36})\//i.exec(String(data?.issuer || ""));
  return match ? match[1].toLowerCase() : null;
}

/** How Microsoft manages a domain: "Managed", "Federated", "Unknown"; and whether it's a viral (unmanaged) tenant. */
export async function lookupDomainRealm(domain, { fetchImpl = fetch } = {}) {
  const data = await getJson(fetchImpl, `${LOGIN}/getuserrealm.srf?login=${encodeURIComponent(`user@${domain}`)}&json=1`);
  return { namespaceType: data?.NameSpaceType || "Unknown", isViral: data?.IsViral === true };
}

/**
 * Is `domain` a verified domain of Microsoft tenant `tenantId`?
 * Returns { domain } when it is, or { error } with a message for the admin.
 */
export async function verifyDomainForTenant(input, tenantId, { fetchImpl = fetch } = {}) {
  const domain = normalizeDomain(input);
  if (!domain) return { error: `"${String(input || "").trim()}" isn't a valid email domain.` };
  if (CONSUMER_DOMAINS.has(domain)) return { error: `${domain} is a public email domain, not your organization's.` };
  let tenant;
  let realm;
  try {
    [tenant, realm] = await Promise.all([lookupDomainTenant(domain, { fetchImpl }), lookupDomainRealm(domain, { fetchImpl })]);
  } catch {
    return { error: `Couldn't check ${domain} with Microsoft. Please try again.` };
  }
  if (!tenant || tenant === CONSUMER_TENANT_ID) {
    return { error: `${domain} isn't a verified domain in any Microsoft organization.` };
  }
  if (realm.isViral || !["Managed", "Federated"].includes(realm.namespaceType)) {
    return { error: `${domain} isn't managed by a Microsoft organization's administrator.` };
  }
  if (tenant !== String(tenantId || "").toLowerCase()) {
    return { error: `${domain} belongs to a different Microsoft organization than your SAML app.` };
  }
  return { domain };
}

/** Checks several domains; returns { domains } (all verified, de-duplicated) or { error } for the first failure. */
export async function verifyDomainsForTenant(inputs, tenantId, options) {
  const list = [...new Set((Array.isArray(inputs) ? inputs : [inputs]).map((d) => String(d || "").trim()).filter(Boolean))];
  if (!list.length) return { error: "Enter at least one email domain your people sign in with." };
  if (list.length > 20) return { error: "Enter at most 20 domains." };
  const domains = [];
  for (const input of list) {
    const result = await verifyDomainForTenant(input, tenantId, options);
    if (result.error) return { error: result.error };
    if (!domains.includes(result.domain)) domains.push(result.domain);
  }
  return { domains };
}
