// EKP Workstream A, A1 (A-6): app-only Microsoft Graph calls made with the
// KMS Sign-in app in a connected customer tenant. Needs the application
// permission GroupMember.Read.All (read groups and their members), granted
// by the tenant admin through Connect / Reconnect Microsoft.

const LOGIN = "https://login.microsoftonline.com";
const GRAPH = "https://graph.microsoft.com/v1.0";

export class GraphPermissionError extends Error {}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

async function appToken(tenantId) {
  const res = await fetch(`${LOGIN}/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: requireEnv("ENTRA_SSO_CLIENT_ID"),
      client_secret: requireEnv("ENTRA_SSO_CLIENT_SECRET"),
      grant_type: "client_credentials",
      scope: "https://graph.microsoft.com/.default",
    }).toString(),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error_description?.split("\n")[0] || "Couldn't get a Microsoft token");
  return data.access_token;
}

async function graphGet(token, path, headers = {}) {
  const res = await fetch(path.startsWith("http") ? path : `${GRAPH}${path}`, {
    headers: { Authorization: `Bearer ${token}`, ...headers },
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 403 || data.error?.code === "Authorization_RequestDenied") {
    throw new GraphPermissionError(
      "KMS can't read your Microsoft groups yet. Use Reconnect to approve the updated permissions."
    );
  }
  if (!res.ok) throw new Error(data.error?.message || `Microsoft Graph error (${res.status})`);
  return data;
}

/** Security groups in the tenant, optionally filtered by name (max 50). */
export async function listTenantGroups(tenantId, search = "") {
  const token = await appToken(tenantId);
  const term = String(search).replace(/["\\]/g, "").trim();
  const params = new URLSearchParams({
    $filter: "securityEnabled eq true",
    $select: "id,displayName,description",
    $orderby: "displayName",
    $top: "50",
    $count: "true",
  });
  if (term) params.set("$search", `"displayName:${term}"`);
  const data = await graphGet(token, `/groups?${params}`, { ConsistencyLevel: "eventual" });
  return (data.value || []).map((g) => ({ id: g.id, name: g.displayName, description: g.description || null }));
}

/**
 * Which of `groupIds` the user belongs to, directly or through other groups.
 * Checked group by group (the mapped groups only), because listing all of a
 * user's groups needs a user-read permission the KMS Sign-in app doesn't have.
 */
export async function getUserGroupIds(tenantId, objectId, groupIds) {
  const GUID = /^[0-9a-f-]{36}$/i;
  if (!GUID.test(objectId)) throw new Error("Invalid Microsoft object id");
  const token = await appToken(tenantId);
  const member = [];
  for (const groupId of groupIds.filter((id) => GUID.test(id))) {
    const data = await graphGet(
      token,
      `/groups/${groupId}/transitiveMembers/microsoft.graph.user?$filter=id eq '${objectId}'&$count=true&$select=id`,
      { ConsistencyLevel: "eventual" }
    );
    if (data.value?.length) member.push(groupId);
  }
  return member;
}
