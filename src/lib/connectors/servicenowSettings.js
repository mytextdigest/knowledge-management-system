// EKP A-17: validating what an admin enters on the ServiceNow settings page.
// See servicenow.js for the stored shape.

import { normalizeInstanceUrl } from "./servicenowApi.js";

/**
 * Connect form → { connection, scope, secret } or { error }. `connection` is
 * what servicenowApi takes; `scope` and `secret` are what's stored.
 */
export function validateConnectBody(body) {
  const instanceUrl = normalizeInstanceUrl(body?.instanceUrl);
  if (!instanceUrl) return { error: "Enter the instance address, e.g. https://yourcompany.service-now.com" };
  const text = (v) => (typeof v === "string" ? v.trim() : "");

  if (body.authType === "oauth") {
    const clientId = text(body.clientId);
    const clientSecret = typeof body.clientSecret === "string" ? body.clientSecret : "";
    if (!clientId || !clientSecret) return { error: "Enter the OAuth client ID and client secret" };
    return {
      connection: { instanceUrl, auth: { type: "oauth", clientId, clientSecret } },
      scope: { instanceUrl, authType: "oauth", clientId },
      secret: { clientSecret },
    };
  }
  const username = text(body?.username);
  const password = typeof body?.password === "string" ? body.password : "";
  if (!username || !password) return { error: "Enter the integration user's name and password" };
  return {
    connection: { instanceUrl, auth: { type: "basic", username, password } },
    scope: { instanceUrl, authType: "basic", username },
    secret: { password },
  };
}

/**
 * The new knowledge-base list from the admin's picks ([{ kbId, title,
 * departmentId }], unpicked ones left out). A knowledge base keeps its cursor
 * unless its department changed: then it's listed in full again, which moves
 * its existing documents to the new department.
 */
export function mergeKnowledgeBases(current, selections) {
  const byId = new Map((current || []).map((kb) => [kb.kbId, kb]));
  return selections.map(({ kbId, title, departmentId }) => {
    const prev = byId.get(kbId);
    return {
      kbId,
      title: title || prev?.title || kbId,
      departmentId,
      cursor: prev && prev.departmentId === departmentId ? prev.cursor ?? null : null,
    };
  });
}
