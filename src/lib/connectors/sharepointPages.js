// EKP Workstream A (A-15): SharePoint site pages as searchable documents.
//
// A page is a file (.aspx) in one of the site's page libraries, so it has
// the same drive-item id, delta and permissions as a document. Its text
// comes from:
//   - modern pages: the page canvas (Graph sitePage canvasLayout);
//   - classic wiki pages (Site Pages or a Wiki Page Library): the WikiField
//     list field;
//   - classic publishing pages ("Pages" library): PublishingPageContent.
// Pages are stored as contentType "page" with their text in Document.content
// and no file.
//
// Page libraries are recorded per site in scopeConfig.sites[].pageLibraries
// ([{ listId, driveId, template, cursor }]), each with its own delta cursor.
//
// Imported by the worker, so relative imports only.

import { getPagesDriveId } from "../msGraph.js";
import { getSharePointToken, isSharePointCertConfigured, listPageLibraries } from "./sharepointRest.js";
import { htmlToText } from "./htmlText.js";

export { htmlToText };

export const WIKI_LIBRARY = 119;
export const PUBLISHING_LIBRARY = 850;

/**
 * The site's page libraries with their drive ids. Found through SharePoint
 * REST when a certificate is configured (Graph's /lists hides them);
 * otherwise only "Site Pages", by its English title.
 */
export async function findPageLibraries({ accessToken, site, tenantId }) {
  let libraries = null;
  if (isSharePointCertConfigured() && site.siteUrl) {
    try {
      libraries = await listPageLibraries(site.siteUrl, await getSharePointToken(tenantId, new URL(site.siteUrl).host));
    } catch (err) {
      console.error(`Couldn't list the page libraries of ${site.siteUrl}:`, err.message);
    }
  }
  if (!libraries) libraries = [{ listId: null, template: WIKI_LIBRARY }];

  const found = [];
  for (const library of libraries) {
    const driveId = await getPagesDriveId({ accessToken, siteId: site.siteId, listId: library.listId });
    if (driveId) found.push({ ...library, driveId });
  }
  return found;
}

/** A site's recorded page libraries (reads the single-library keys of earlier syncs too). */
export function pageLibrariesOf(site) {
  if (Array.isArray(site?.pageLibraries)) return site.pageLibraries;
  if (site?.pagesDriveId) return [{ listId: null, driveId: site.pagesDriveId, template: WIKI_LIBRARY, cursor: site.pagesCursor ?? null }];
  return [];
}

/**
 * A classic page's searchable text from its list fields: title,
 * description, and the wiki or publishing page body.
 */
export function classicPageText(fields) {
  const parts = [fields?.Title, fields?.Comments, fields?.Description];
  for (const key of ["WikiField", "PublishingPageContent"]) {
    if (typeof fields?.[key] === "string") parts.push(htmlToText(fields[key]));
  }
  return [...new Set(parts.map((p) => (typeof p === "string" ? p.trim() : "")).filter(Boolean))].join("\n\n");
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
