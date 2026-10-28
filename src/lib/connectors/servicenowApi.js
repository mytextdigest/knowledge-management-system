// EKP A-17: read-only ServiceNow client. Uses only the stable Table API
// (GET /api/now/table/...) so it works on any recent release (NYPA runs
// "Australia"). Nothing is ever written to ServiceNow.
//
// A connection is { instanceUrl, auth }, where auth is
//   { type: "basic", username, password }  or
//   { type: "oauth", clientId, clientSecret, scope? }  (client credentials grant;
//     scope is an OAuth scope limited to the Table API, if the instance uses one)
//
// Imported by the worker, so relative imports only.

const PAGE_SIZE = 100;
const ARTICLE_FIELDS = "sys_id,number,short_description,text,kb_knowledge_base,workflow_state,sys_updated_on";

// Only ServiceNow-hosted instances (commercial and US government cloud), so
// an admin-entered URL can't point the server at an arbitrary host.
const INSTANCE_HOST = /^[a-z0-9][a-z0-9-]*\.(service-now\.com|servicenowservices\.com)$/i;

/** "dev123.service-now.com/" or "https://dev123.service-now.com/now/nav" → "https://dev123.service-now.com", or null. */
export function normalizeInstanceUrl(raw) {
  let url;
  try {
    url = new URL(/^https?:\/\//i.test(String(raw || "").trim()) ? String(raw).trim() : `https://${String(raw || "").trim()}`);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.port || url.username || !INSTANCE_HOST.test(url.hostname)) return null;
  return `https://${url.hostname.toLowerCase()}`;
}

/** Link to an article as readers see it in ServiceNow. */
export function articleUrl(instanceUrl, article) {
  return `${instanceUrl}/kb_view.do?sysparm_article=${encodeURIComponent(article.number)}`;
}

class ServiceNowError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

const tokenCache = new Map(); // `${instanceUrl}|${clientId}` → { token, expiresAt }

async function authorization({ instanceUrl, auth }, fetchImpl) {
  if (auth?.type === "basic") {
    return `Basic ${Buffer.from(`${auth.username}:${auth.password}`).toString("base64")}`;
  }
  if (auth?.type === "oauth") {
    const key = `${instanceUrl}|${auth.clientId}|${auth.scope || ""}`;
    const cached = tokenCache.get(key);
    if (cached && cached.expiresAt - Date.now() > 60_000) return `Bearer ${cached.token}`;
    const res = await fetchImpl(`${instanceUrl}/oauth_token.do`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: auth.clientId,
        client_secret: auth.clientSecret,
        ...(auth.scope ? { scope: auth.scope } : {}),
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.access_token) {
      throw new ServiceNowError(`ServiceNow OAuth sign-in failed (${res.status}): ${data.error_description || data.error || "no token"}`, res.status);
    }
    tokenCache.set(key, { token: data.access_token, expiresAt: Date.now() + (data.expires_in || 1800) * 1000 });
    return `Bearer ${data.access_token}`;
  }
  throw new ServiceNowError("Unknown ServiceNow auth type");
}

/** GET a Table API table. Returns { result, total }. */
export async function tableGet(conn, table, params, { fetchImpl = fetch } = {}) {
  const url = new URL(`${conn.instanceUrl}/api/now/table/${table}`);
  for (const [k, v] of Object.entries(params)) if (v !== undefined) url.searchParams.set(k, String(v));
  const res = await fetchImpl(url, {
    headers: { Authorization: await authorization(conn, fetchImpl), Accept: "application/json" },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const detail = body?.error?.message || res.statusText;
    const hint =
      res.status === 401
        ? conn.auth?.type === "basic"
          ? " (check the user name and password; some instances allow only OAuth for API access)"
          : " (check the OAuth client)"
        : res.status === 403
        ? " (the integration user lacks read access)"
        : "";
    throw new ServiceNowError(`ServiceNow ${table} request failed (${res.status}): ${detail}${hint}`, res.status);
  }
  const body = await res.json();
  return { result: body.result || [], total: Number(res.headers.get("x-total-count")) || null };
}

/** Active knowledge bases: [{ id, title, description }]. Also serves as the connection test. */
export async function listKnowledgeBases(conn, opts) {
  const { result } = await tableGet(
    conn,
    "kb_knowledge_base",
    { sysparm_query: "active=true^ORDERBYtitle", sysparm_fields: "sys_id,title,description", sysparm_limit: 200 },
    opts
  );
  return result.map((kb) => ({ id: kb.sys_id, title: kb.title, description: kb.description || "" }));
}

/**
 * Articles of the given knowledge bases changed at or after `since` (a
 * ServiceNow UTC timestamp "YYYY-MM-DD HH:mm:ss", or null for all), oldest
 * first, every workflow state (so retired articles can be taken down).
 */
export async function listArticles(conn, { kbIds, since = null }, opts) {
  if (!kbIds.length) return [];
  const query = [`kb_knowledge_baseIN${kbIds.join(",")}`, since ? `sys_updated_on>=${since}` : null, "ORDERBYsys_updated_on", "ORDERBYsys_id"]
    .filter(Boolean)
    .join("^");
  const articles = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { result } = await tableGet(
      conn,
      "kb_knowledge",
      { sysparm_query: query, sysparm_fields: ARTICLE_FIELDS, sysparm_exclude_reference_link: true, sysparm_limit: PAGE_SIZE, sysparm_offset: offset },
      opts
    );
    articles.push(...result);
    if (result.length < PAGE_SIZE) return articles;
  }
}

/** A ServiceNow UTC timestamp ("2026-10-27 14:03:11") as a Date. */
export function parseServiceNowTime(value) {
  return new Date(`${String(value).replace(" ", "T")}Z`);
}
