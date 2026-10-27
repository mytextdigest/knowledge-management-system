// EKP A-17: ServiceNow Knowledge Base connector (FR-1's contract).
//
// Ingests published KB articles (table kb_knowledge) of the knowledge bases
// an admin picked, each mapped to a KMS department, like SharePoint sites.
// Articles are stored as contentType "article" with their text in
// Document.content and no file. Access is the mapped department's: articles
// get no DocumentAcl rows, and per-article user criteria are not enforced
// (NYPA Q&A #126).
//
// OrgIntegration (provider "servicenow"):
//   accessToken  encryptJson of the secret: { password } or { clientSecret }
//   scopeConfig  { instanceUrl, authType: "basic" | "oauth", username | clientId,
//                  connectedByUserId,
//                  knowledgeBases: [{ kbId, title, departmentId, cursor }] }
//                cursor = sys_updated_on of the newest article seen (UTC).
//
// Imported by the worker, so relative imports only.

import { BaseConnector } from "./base.js";
import { articleUrl, listArticles, listKnowledgeBases, parseServiceNowTime } from "./servicenowApi.js";
import { htmlToText } from "./htmlText.js";
import { decryptJson } from "../crypto.js";

/** { instanceUrl, auth } of a stored integration. */
export function serviceNowConnection(integration) {
  const config = integration.scopeConfig || {};
  const secret = decryptJson(integration.accessToken);
  const auth =
    config.authType === "oauth"
      ? { type: "oauth", clientId: config.clientId, clientSecret: secret.clientSecret }
      : { type: "basic", username: config.username, password: secret.password };
  return { instanceUrl: config.instanceUrl, auth };
}

/** An article's searchable text: number and title first, so both can be found and cited. */
export function articleText(article) {
  const title = article.short_description || "";
  return [`${article.number}${title ? `: ${title}` : ""}`, htmlToText(article.text)].filter(Boolean).join("\n\n");
}

export class ServiceNowConnector extends BaseConnector {
  constructor({ instanceUrl, auth, kbId, fetchImpl }) {
    super();
    if (!instanceUrl || !auth) throw new Error("ServiceNowConnector requires instanceUrl and auth");
    this.conn = { instanceUrl, auth };
    this.kbId = kbId;
    this.opts = fetchImpl ? { fetchImpl } : undefined;
  }

  // The available knowledge bases (the connect-time picker).
  async getFolderTree() {
    const kbs = await listKnowledgeBases(this.conn, this.opts);
    return kbs.map((kb) => ({ externalId: kb.id, name: kb.title, isFolder: true }));
  }

  // Articles of this knowledge base changed since `cursor`. An article that
  // is no longer published (retired, back in review) comes back as deleted.
  async listChanges(cursor) {
    if (!this.kbId) throw new Error("ServiceNowConnector.listChanges requires kbId");
    const articles = await listArticles(this.conn, { kbIds: [this.kbId], since: cursor || null }, this.opts);
    const changes = articles.map((a) => ({
      externalId: a.sys_id,
      name: a.short_description || a.number,
      modifiedAt: parseServiceNowTime(a.sys_updated_on).toISOString(),
      deleted: a.workflow_state !== "published",
      webUrl: articleUrl(this.conn.instanceUrl, a),
      content: articleText(a),
    }));
    return { changes, cursor: articles.at(-1)?.sys_updated_on || cursor || null };
  }

  async downloadFile() {
    throw new Error("ServiceNow articles have no file; their text comes with listChanges()");
  }
}
