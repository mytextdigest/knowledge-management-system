// EKP Workstream A (A-14/A-15): where a synced SharePoint item lives, from
// what's already stored (no extra database column): the document's
// SharePoint URL (Document.externalUrl) identifies the connected site, and
// the site's entry in OrgIntegration.scopeConfig.sites records the drive id
// of its document library (`driveId`), written by every sync; if missing it
// is looked up from Graph. Pages have no file, so they need no drive here.
//
// Imported by the worker, so relative imports only.

import { getSiteDriveId } from "../msGraph.js";

const trimSlash = (url) => String(url || "").replace(/\/+$/, "").toLowerCase();

/**
 * The connected site an item URL belongs to: the longest site URL that is a
 * prefix of it at a path boundary (so /sites/Eng doesn't match /sites/Engineering).
 */
export function siteForUrl(sites, url) {
  const target = trimSlash(url);
  if (!target) return null;
  let best = null;
  for (const site of sites || []) {
    const base = trimSlash(site.siteUrl);
    if (!base) continue;
    const matches = target === base || (target.startsWith(base) && ["/", "?", "#"].includes(target.charAt(base.length)));
    if (matches && (!best || base.length > trimSlash(best.siteUrl).length)) best = site;
  }
  return best;
}

/**
 * The drive id holding a synced SharePoint file (the site's document
 * library), or null for a page or when its site can't be identified.
 */
export async function resolveDriveId(doc, { scopeConfig, accessToken }) {
  if (doc.contentType === "page") return null;
  const site = siteForUrl(scopeConfig?.sites, doc.externalUrl);
  if (!site) return null;
  return site.driveId || getSiteDriveId({ accessToken, siteId: site.siteId });
}
