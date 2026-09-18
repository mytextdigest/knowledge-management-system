// Microsoft Graph helpers for the SharePoint connector (Rank 3 / Task 7-B).
//
// Two distinct auth modes, per REQUIREMENTS_INGESTION_PIPELINE.md FR-2:
//   1. Delegated — used ONLY once, at connect-time, to list an org's SharePoint
//      sites and grant the shared app's Sites.Selected access to the ones an
//      admin picks. Never persisted.
//   2. App-only (client credentials) — used for every ongoing sync, scoped to
//      whichever sites were granted in step 1.

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

async function parseGraphError(res) {
  let body;
  try {
    body = await res.json();
  } catch {
    body = await res.text().catch(() => "");
  }
  const message = body?.error?.message || JSON.stringify(body) || res.statusText;
  const err = new Error(`Graph API error (${res.status}): ${message}`);
  err.status = res.status;
  err.body = body;
  return err;
}

// --- Delegated auth (connect-time only) ---------------------------------

// "organizations" (not "common") — excludes personal Microsoft accounts,
// matching the decision to only support organizational tenants.
const AUTHORITY = "https://login.microsoftonline.com/organizations";
const DELEGATED_SCOPE = "https://graph.microsoft.com/Sites.FullControl.All";

export function buildDelegatedAuthorizeUrl({ state, redirectUri }) {
  const params = new URLSearchParams({
    client_id: requireEnv("MSGRAPH_CLIENT_ID"),
    response_type: "code",
    redirect_uri: redirectUri,
    response_mode: "query",
    scope: `${DELEGATED_SCOPE} openid profile`,
    state,
  });
  return `${AUTHORITY}/oauth2/v2.0/authorize?${params.toString()}`;
}

export async function exchangeDelegatedCode({ code, redirectUri }) {
  const params = new URLSearchParams({
    client_id: requireEnv("MSGRAPH_CLIENT_ID"),
    client_secret: requireEnv("MSGRAPH_CLIENT_SECRET"),
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    scope: `${DELEGATED_SCOPE} openid profile`,
  });
  const res = await fetch(`${AUTHORITY}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  if (!res.ok) throw await parseGraphError(res);
  const data = await res.json();
  return {
    accessToken: data.access_token,
    expiresIn: data.expires_in,
    tenantId: decodeTenantId(data.access_token),
  };
}

// Decode the `tid` claim from a JWT without verifying the signature — fine
// here since the token is only ever used to make an authenticated Graph call
// (a forged tid would just fail there), never trusted for authorization.
function decodeTenantId(jwt) {
  const payload = jwt.split(".")[1];
  const json = Buffer.from(payload, "base64url").toString("utf8");
  return JSON.parse(json).tid;
}

// --- App-only auth (ongoing sync) ----------------------------------------

export async function getAppOnlyToken(tenantId) {
  const params = new URLSearchParams({
    client_id: requireEnv("MSGRAPH_CLIENT_ID"),
    client_secret: requireEnv("MSGRAPH_CLIENT_SECRET"),
    grant_type: "client_credentials",
    scope: "https://graph.microsoft.com/.default",
  });
  const res = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  if (!res.ok) throw await parseGraphError(res);
  const data = await res.json();
  return { accessToken: data.access_token, expiresIn: data.expires_in };
}

// --- Graph calls -----------------------------------------------------------

async function graphFetch(path, { accessToken, method = "GET", body } = {}) {
  const res = await fetch(`${GRAPH_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw await parseGraphError(res);
  if (res.status === 204) return null;
  return res.json();
}

// Delegated-token call: enumerate sites the signed-in admin can see (which,
// for a tenant admin, is effectively every site in the tenant).
export async function listSites({ accessToken, query = "*" }) {
  const data = await graphFetch(`/sites?search=${encodeURIComponent(query)}`, { accessToken });
  return (data.value || []).map((site) => ({
    id: site.id,
    name: site.displayName || site.name,
    webUrl: site.webUrl,
  }));
}

// Delegated-token call: bootstrap the app-only connector's access to one
// specific site. Requires Sites.FullControl.All delegated on the caller.
export async function grantSitePermission({ accessToken, siteId, appId, appDisplayName }) {
  return graphFetch(`/sites/${siteId}/permissions`, {
    accessToken,
    method: "POST",
    body: {
      roles: ["read"],
      grantedToIdentities: [
        {
          application: { id: appId, displayName: appDisplayName },
        },
      ],
    },
  });
}

// App-only-token call: root-level listing for FR-1's getFolderTree().
export async function getFolderTree({ accessToken, siteId }) {
  const data = await graphFetch(`/sites/${siteId}/drive/root/children`, { accessToken });
  return data.value || [];
}

// App-only-token call: delta query for FR-2/FR-4. Pass `cursor` (a full
// `@odata.deltaLink` URL) to resume from the last sync; omit it to do the
// initial full listing.
export async function getDelta({ accessToken, siteId, cursor }) {
  const url = cursor || `${GRAPH_BASE}/sites/${siteId}/drive/root/delta`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw await parseGraphError(res);
  const data = await res.json();
  return {
    items: data.value || [],
    nextLink: data["@odata.nextLink"] || null,
    deltaLink: data["@odata.deltaLink"] || null,
  };
}

// App-only-token call: download a file's binary content for FR-2's ingest step.
export async function downloadFileContent({ accessToken, siteId, itemId }) {
  const res = await fetch(`${GRAPH_BASE}/sites/${siteId}/drive/items/${itemId}/content`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw await parseGraphError(res);
  return Buffer.from(await res.arrayBuffer());
}
