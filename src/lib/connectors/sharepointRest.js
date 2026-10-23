// EKP Workstream A (A-9): SharePoint REST calls made with the SharePoint
// connector app. Used only for what Graph v1.0 can't do: listing the members
// of SharePoint site groups (Owners / Members / Visitors and custom groups).
//
// SharePoint app-only REST refuses client-secret tokens, so the token is
// requested with a certificate-signed client assertion. The certificate is
// uploaded to the connector app in Entra; the key never leaves KMS.
//   Local dev:  SHAREPOINT_CERT_PATH / SHAREPOINT_CERT_KEY_PATH (PEM files)
//   Deployed:   SHAREPOINT_CERT_PEM / SHAREPOINT_CERT_KEY_PEM (PEM contents)
// See WS_A_M365_CONNECTORS.md §7 (A-8 findings).
//
// Imported by the worker, so relative imports only.

import fs from "node:fs";
import crypto from "node:crypto";

const LOGIN = "https://login.microsoftonline.com";
const TOKEN_REFRESH_BUFFER_MS = 2 * 60_000;

function readPem(contentVar, pathVar) {
  const content = process.env[contentVar];
  if (content) return content.replace(/\\n/g, "\n");
  const path = process.env[pathVar];
  return path ? fs.readFileSync(path, "utf8") : null;
}

let certCache;
function loadCertificate() {
  if (certCache !== undefined) return certCache;
  const certPem = readPem("SHAREPOINT_CERT_PEM", "SHAREPOINT_CERT_PATH");
  const keyPem = readPem("SHAREPOINT_CERT_KEY_PEM", "SHAREPOINT_CERT_KEY_PATH");
  if (!certPem || !keyPem) {
    certCache = null;
    return certCache;
  }
  const der = new crypto.X509Certificate(certPem).raw;
  certCache = { keyPem, x5t: crypto.createHash("sha1").update(der).digest("base64url") };
  return certCache;
}

/** Whether a certificate is configured, i.e. whether site groups can be expanded. */
export function isSharePointCertConfigured() {
  return Boolean(loadCertificate());
}

function clientAssertion(tokenUrl, clientId) {
  const cert = loadCertificate();
  const b64u = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${b64u({ alg: "RS256", typ: "JWT", x5t: cert.x5t })}.${b64u({
    aud: tokenUrl,
    iss: clientId,
    sub: clientId,
    jti: crypto.randomUUID(),
    nbf: now,
    exp: now + 600,
  })}`;
  const signature = crypto.sign("RSA-SHA256", Buffer.from(unsigned), cert.keyPem).toString("base64url");
  return `${unsigned}.${signature}`;
}

const tokenCache = new Map(); // `${tenantId}|${host}` → { token, expiresAt }

/** App-only token for SharePoint REST on `host` (e.g. contoso.sharepoint.com). */
export async function getSharePointToken(tenantId, host) {
  const key = `${tenantId}|${host}`;
  const cached = tokenCache.get(key);
  if (cached && cached.expiresAt - Date.now() > TOKEN_REFRESH_BUFFER_MS) return cached.token;

  if (!isSharePointCertConfigured()) throw new Error("SharePoint certificate is not configured");
  const clientId = process.env.MSGRAPH_CLIENT_ID;
  if (!clientId) throw new Error("MSGRAPH_CLIENT_ID is not set");

  const tokenUrl = `${LOGIN}/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`;
  const res = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      grant_type: "client_credentials",
      scope: `https://${host}/.default`,
      client_assertion_type: "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
      client_assertion: clientAssertion(tokenUrl, clientId),
    }).toString(),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error_description?.split("\n")[0] || `SharePoint token error (${res.status})`);
  tokenCache.set(key, { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 });
  return data.access_token;
}

/** GET a SharePoint REST path (`/web/...`) on a site. Follows paging. */
export async function sharePointRestGetAll(siteUrl, path, token) {
  let url = `${siteUrl.replace(/\/$/, "")}/_api${path}`;
  const values = [];
  while (url) {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json;odata=nometadata" },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const message = data["odata.error"]?.message?.value || `SharePoint REST error (${res.status})`;
      const err = new Error(message);
      err.status = res.status;
      throw err;
    }
    values.push(...(data.value || []));
    url = data["odata.nextLink"] || null;
  }
  return values;
}

/** Members of a SharePoint site group: [{ loginName, principalType }]. */
export async function listSiteGroupMembers(siteUrl, groupId, token) {
  const users = await sharePointRestGetAll(
    siteUrl,
    `/web/sitegroups(${Number(groupId)})/users?$select=LoginName,PrincipalType`,
    token
  );
  return users.map((u) => ({ loginName: u.LoginName, principalType: u.PrincipalType }));
}

/** The site's SharePoint groups: [{ id, title }]. */
export async function listSiteGroups(siteUrl, token) {
  const groups = await sharePointRestGetAll(siteUrl, "/web/sitegroups?$select=Id,Title", token);
  return groups.map((g) => ({ id: String(g.Id), title: g.Title }));
}

/** The id of the site's pages library (base template 119, "Site Pages" in English), or null. */
export async function getPagesListId(siteUrl, token) {
  const lists = await sharePointRestGetAll(siteUrl, "/web/lists?$filter=BaseTemplate eq 119&$select=Id", token);
  return lists[0]?.Id ?? null;
}
