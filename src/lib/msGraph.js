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

// Graph throttles with 429 (and sometimes 503) plus Retry-After. A full ACL
// pass makes one permissions call per item, so honour it instead of failing.
const MAX_RETRIES = 4;

async function fetchWithRetry(url, init) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, init);
    if ((res.status !== 429 && res.status !== 503) || attempt >= MAX_RETRIES) return res;
    const retryAfter = Number(res.headers.get("retry-after"));
    const waitMs = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 2 ** attempt * 1000;
    await new Promise((resolve) => setTimeout(resolve, Math.min(waitMs, 60_000)));
  }
}

async function graphFetch(path, { accessToken, method = "GET", body, headers = {} } = {}) {
  const res = await fetchWithRetry(path.startsWith("http") ? path : `${GRAPH_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw await parseGraphError(res);
  if (res.status === 204) return null;
  return res.json();
}

// GET every page of a collection (follows @odata.nextLink).
async function graphGetAll(path, { accessToken, headers } = {}) {
  const values = [];
  let next = path;
  while (next) {
    const data = await graphFetch(next, { accessToken, headers });
    values.push(...(data.value || []));
    next = data["@odata.nextLink"] || null;
  }
  return values;
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
// initial full listing. Follows every @odata.nextLink page, so large
// libraries aren't cut off after the first page.
//
// A-9: with `sharingChanges`, Graph also returns items whose permissions
// changed, marked `@microsoft.graph.sharedChanged` (verified in the A-8
// spike). Without `hierarchicalsharing`, a folder's sharing change is
// reported on the items below it too.
export async function getDelta({ accessToken, siteId, cursor, sharingChanges = false }) {
  const headers = sharingChanges ? { Prefer: "deltashowsharingchanges" } : {};
  let url = cursor || `${GRAPH_BASE}/sites/${siteId}/drive/root/delta`;
  const items = [];
  let deltaLink = null;
  while (url) {
    const data = await graphFetch(url, { accessToken, headers });
    items.push(...(data.value || []));
    url = data["@odata.nextLink"] || null;
    deltaLink = data["@odata.deltaLink"] || deltaLink;
  }
  return { items, deltaLink };
}

// A-9: app-only-token call: the id of a site's default document library.
export async function getSiteDriveId({ accessToken, siteId }) {
  const drive = await graphFetch(`/sites/${siteId}/drive?$select=id`, { accessToken });
  return drive.id;
}

// A-9: app-only-token call: an item's permissions (direct and inherited).
export async function getItemPermissions({ accessToken, driveId, itemId }) {
  return graphGetAll(`/drives/${driveId}/items/${itemId}/permissions`, { accessToken });
}

// A-9: app-only-token call: an Entra user's object id from their UPN, or
// null if there's no such user. Needs User.Read.All on the connector app.
export async function getUserIdByUpn({ accessToken, upn }) {
  try {
    const user = await graphFetch(`/users/${encodeURIComponent(upn)}?$select=id`, { accessToken });
    return user.id;
  } catch (err) {
    if (err.status === 404) return null;
    throw err;
  }
}

// A-9: app-only-token call: one drive item (null if it no longer exists).
export async function getDriveItem({ accessToken, driveId, itemId, select = "id,name,webUrl,lastModifiedDateTime,size,file,parentReference" }) {
  try {
    return await graphFetch(`/drives/${driveId}/items/${itemId}?$select=${select}`, { accessToken });
  } catch (err) {
    if (err.status === 404) return null;
    throw err;
  }
}

// App-only-token call: download a file's binary content for FR-2's ingest step.
export async function downloadFileContent({ accessToken, siteId, itemId }) {
  const res = await fetchWithRetry(`${GRAPH_BASE}/sites/${siteId}/drive/items/${itemId}/content`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw await parseGraphError(res);
  return Buffer.from(await res.arrayBuffer());
}

// --- Identity lookups (A-21 / A-10), app-only, SharePoint connector app ----

const appTokenCache = new Map(); // tenantId → { token, expiresAt }

// getAppOnlyToken, reused until two minutes before it expires.
export async function getCachedAppOnlyToken(tenantId) {
  const cached = appTokenCache.get(tenantId);
  if (cached && cached.expiresAt - Date.now() > 2 * 60_000) return cached.token;
  const { accessToken, expiresIn } = await getAppOnlyToken(tenantId);
  appTokenCache.set(tenantId, { token: accessToken, expiresAt: Date.now() + expiresIn * 1000 });
  return accessToken;
}

// Entra users whose UPN or mail is one of `emails`, matched case-insensitively.
// Returns Map(lowercased email → [{ id, accountEnabled, userType }]).
const EMAILS_PER_QUERY = 7; // 2 terms per email; Graph allows 15 `in` values per clause
export async function findUsersByEmails({ accessToken, emails }) {
  const wanted = [...new Set(emails.map((e) => String(e).trim().toLowerCase()).filter(Boolean))];
  const result = new Map(wanted.map((e) => [e, []]));
  for (let i = 0; i < wanted.length; i += EMAILS_PER_QUERY) {
    const batch = wanted.slice(i, i + EMAILS_PER_QUERY);
    const list = batch.map((e) => `'${e.replace(/'/g, "''")}'`).join(",");
    const params = new URLSearchParams({
      $filter: `userPrincipalName in (${list}) or mail in (${list})`,
      $select: "id,accountEnabled,mail,userPrincipalName,userType",
      $top: "999",
    });
    const users = await graphGetAll(`/users?${params}`, { accessToken });
    for (const user of users) {
      const keys = new Set([user.userPrincipalName, user.mail].filter(Boolean).map((v) => v.toLowerCase()));
      for (const key of keys) {
        const list = result.get(key);
        if (list && !list.some((u) => u.id === user.id)) {
          list.push({ id: user.id, accountEnabled: user.accountEnabled, userType: user.userType });
        }
      }
    }
  }
  return result;
}

// An Entra user's transitive group ids and the ids of groups they own.
// Returns null if the user no longer exists.
export async function getUserGroupIds({ accessToken, userId }) {
  try {
    const [memberOf, owned] = await Promise.all([
      graphGetAll(`/users/${userId}/transitiveMemberOf/microsoft.graph.group?$select=id&$top=999`, { accessToken }),
      graphGetAll(`/users/${userId}/ownedObjects/microsoft.graph.group?$select=id&$top=999`, { accessToken }),
    ]);
    return {
      groupIds: [...new Set(memberOf.map((g) => g.id.toLowerCase()))].sort(),
      ownedGroupIds: [...new Set(owned.map((g) => g.id.toLowerCase()))].sort(),
    };
  } catch (err) {
    if (err.status === 404) return null;
    throw err;
  }
}

// --- No-copy mode (A-14) ----------------------------------------------------

// App-only-token call: a drive item's content as a fetch Response (Graph
// redirects to a short-lived download URL; fetch follows it). For streaming.
export async function fetchDriveItemContent({ accessToken, driveId, itemId }) {
  const res = await fetchWithRetry(`${GRAPH_BASE}/drives/${driveId}/items/${itemId}/content`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw await parseGraphError(res);
  return res;
}

// App-only-token call: a drive item's content as a Buffer.
export async function downloadDriveItemContent({ accessToken, driveId, itemId }) {
  const res = await fetchDriveItemContent({ accessToken, driveId, itemId });
  return Buffer.from(await res.arrayBuffer());
}
