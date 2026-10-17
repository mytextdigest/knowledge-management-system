// EKP Workstream A, A1 (A-5): connecting an org's Microsoft tenant for sign-in.
// Two hops through the same callback, one flow for the admin:
//   1. "consent": Microsoft's admin-consent endpoint, where a tenant admin
//      approves the KMS Sign-in app for the whole organization. Returns the
//      tenant id but no token. (The authorize endpoint no longer accepts
//      prompt=admin_consent.)
//   2. "signin": a normal sign-in to that tenant, whose token reads the
//      tenant's id, name and verified domains from Graph /organization.

const LOGIN = "https://login.microsoftonline.com";
const SCOPE = "openid profile email User.Read";

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

// Fixed path: must match a redirect URI registered on the KMS Sign-in app.
export function ssoCallbackUrl() {
  return `${requireEnv("NEXT_PUBLIC_APP_URL")}/api/integrations/entra-sso/callback`;
}

// Hop 1: approve the app's configured permissions (.default) org-wide.
export function buildAdminConsentUrl({ state }) {
  const params = new URLSearchParams({
    client_id: requireEnv("ENTRA_SSO_CLIENT_ID"),
    redirect_uri: ssoCallbackUrl(),
    scope: "https://graph.microsoft.com/.default",
    state,
  });
  return `${LOGIN}/organizations/v2.0/adminconsent?${params.toString()}`;
}

// Hop 2: sign in to the tenant that just approved the app.
export function buildTenantSignInUrl({ state, tenantId }) {
  const params = new URLSearchParams({
    client_id: requireEnv("ENTRA_SSO_CLIENT_ID"),
    response_type: "code",
    response_mode: "query",
    redirect_uri: ssoCallbackUrl(),
    scope: SCOPE,
    state,
  });
  return `${LOGIN}/${encodeURIComponent(tenantId)}/oauth2/v2.0/authorize?${params.toString()}`;
}

export async function exchangeSsoCode(code, tenantId) {
  const res = await fetch(`${LOGIN}/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: requireEnv("ENTRA_SSO_CLIENT_ID"),
      client_secret: requireEnv("ENTRA_SSO_CLIENT_SECRET"),
      grant_type: "authorization_code",
      code,
      redirect_uri: ssoCallbackUrl(),
      scope: SCOPE,
    }).toString(),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error_description?.split("\n")[0] || data.error || "Token exchange failed");
  return data.access_token;
}

// Tenant id, display name and verified domains of the signed-in admin's
// organization. Graph /organization is readable with delegated User.Read.
export async function fetchTenantInfo(accessToken) {
  const res = await fetch(
    "https://graph.microsoft.com/v1.0/organization?$select=id,displayName,verifiedDomains",
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error?.message || "Couldn't read your Microsoft organization");
  const org = data.value?.[0];
  if (!org?.id) throw new Error("Couldn't read your Microsoft organization");
  return {
    tenantId: org.id,
    tenantName: org.displayName || null,
    verifiedDomains: (org.verifiedDomains || []).map((d) => d.name.toLowerCase()).sort(),
  };
}
