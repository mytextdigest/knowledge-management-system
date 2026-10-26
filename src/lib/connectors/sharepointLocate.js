// EKP Workstream A (A-14/A-15): where a synced SharePoint item lives, from
// what's already stored (no extra database column): the document's
// SharePoint URL (Document.externalUrl) identifies the connected site, and
// the site's entry in OrgIntegration.scopeConfig.sites records the drive ids
// of its document library (`driveId`) and pages library (`pagesDriveId`),
// written by every sync. Missing drive ids are looked up from Graph.
//
// Imported by the worker, so relative imports only.

import { getSiteDriveId } from "../msGraph.js";
import { findPagesDriveId } from "./sharepointPages.js";

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
 * The drive id holding a synced SharePoint document (files: the site's
 * document library; pages: its Site Pages library), or null when its site
 * can't be identified.
 */
export async function resolveDriveId(doc, { scopeConfig, accessToken }) {
  const site = siteForUrl(scopeConfig?.sites, doc.externalUrl);
  if (!site) return null;
  if (doc.contentType === "page") {
    return site.pagesDriveId || findPagesDriveId({ accessToken, site, tenantId: scopeConfig.tenantId });
  }
  return site.driveId || getSiteDriveId({ accessToken, siteId: site.siteId });
}
