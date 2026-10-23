// EKP Workstream A (A-15): SharePoint site pages as searchable documents.
//
// A page is a file (.aspx) in the site's "Site Pages" library, so it has the
// same drive-item id, delta and permissions as a document; its text comes
// from the page's canvas (Graph sitePage canvasLayout). Pages are stored as
// contentType "page" with their text in Document.content and no file.
//
// Imported by the worker, so relative imports only.

import { getPagesDriveId } from "../msGraph.js";
import { getPagesListId, getSharePointToken, isSharePointCertConfigured } from "./sharepointRest.js";

/** The drive id of a site's pages library (id via SharePoint REST when a certificate is configured). */
export async function findPagesDriveId({ accessToken, site, tenantId }) {
  let listId = null;
  if (isSharePointCertConfigured() && site.siteUrl) {
    try {
      listId = await getPagesListId(site.siteUrl, await getSharePointToken(tenantId, new URL(site.siteUrl).host));
    } catch (err) {
      console.error(`Couldn't look up the pages library of ${site.siteUrl}:`, err.message);
    }
  }
  return getPagesDriveId({ accessToken, siteId: site.siteId, listId });
}

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

/** HTML fragment → plain text, keeping paragraph and list breaks. */
export function htmlToText(html) {
  return String(html || "")
    .replace(/<\s*(script|style)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, " ")
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\s*\/\s*(p|div|h[1-6]|li|tr|blockquote|pre)\s*>/gi, "\n")
    .replace(/<\s*li[^>]*>/gi, "- ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, code) => {
      if (code[0] === "#") {
        const n = code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
        return Number.isFinite(n) ? String.fromCodePoint(n) : m;
      }
      return ENTITIES[code.toLowerCase()] ?? m;
    })
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function webPartTexts(webPart) {
  if (webPart?.innerHtml) return [htmlToText(webPart.innerHtml)]; // text web part
  const data = webPart?.data || {};
  const content = data.serverProcessedContent || {};
  return [
    data.properties?.title && data.title !== "Banner" ? data.properties.title : null,
    ...(content.searchablePlainTexts || []).map((t) => t.value),
    ...(content.htmlStrings || []).map((t) => htmlToText(t.value)),
  ].filter(Boolean);
}

/** A sitePage (with canvasLayout) → its searchable text: title, description, web parts. */
export function pageToText(page) {
  const layout = page?.canvasLayout || {};
  const parts = [page?.title, page?.description];
  for (const section of layout.horizontalSections || []) {
    for (const column of section.columns || []) {
      for (const webPart of column.webparts || []) parts.push(...webPartTexts(webPart));
    }
  }
  for (const webPart of layout.verticalSection?.webparts || []) parts.push(...webPartTexts(webPart));
  return [...new Set(parts.map((p) => String(p || "").trim()).filter(Boolean))].join("\n\n");
}

/** Whether a Site Pages drive item is a page to ingest (not a folder or template). */
export function isPageItem(item) {
  return Boolean(item?.file) && /\.aspx$/i.test(item.name || "") && !/(^|\/)Templates(\/|$)/i.test(item.parentReference?.path || "");
}
