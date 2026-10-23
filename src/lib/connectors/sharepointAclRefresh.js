// EKP Workstream A (A-11): keeping SharePoint permissions current.
//
// Three triggers, from cheapest to most thorough:
//   1. Every sync: delta flags files whose sharing changed
//      (@microsoft.graph.sharedChanged); only their ACL is re-read (A-9,
//      worker syncOneFile).
//   2. Every sync: site-group membership (e.g. someone added to "Visitors")
//      changes no file, so delta doesn't report it. The sync fingerprints the
//      site's groups; when the fingerprint changes, the whole site's ACLs are
//      re-read (refreshSiteAcls).
//   3. Daily job sharepoint.acl-refresh (src/lib/jobs/registry.js): every
//      file of every connected site, plus every member's Entra identity and
//      groups (refreshIntegrationAcls).
//
// Microsoft 365 / security group membership needs none of this: groups are
// stored on the user (UserIdentity.groupIds), refreshed every 15 minutes.
//
// Imported by the worker, so relative imports only.

import crypto from "node:crypto";
import { getDelta, getDriveDelta, getSiteDriveId } from "../msGraph.js";
import { isPageItem } from "./sharepointPages.js";
import { aclWriteData } from "./sharepointAcl.js";
import { refreshIdentityGroups, syncEmailMatchIdentities } from "../identity/entraIdentity.js";

/**
 * A fingerprint of the site's SharePoint groups and their members (raw
 * login names). Fills the resolver's site-group cache on the way.
 */
export async function siteGroupFingerprint(resolver, siteUrl) {
  const token = await resolver.deps.getSharePointToken(resolver.tenantId, new URL(siteUrl).host);
  const groups = await resolver.deps.listSiteGroups(siteUrl, token);
  const lines = [];
  for (const group of groups) {
    lines.push(`${group.id}|`);
    const members = await resolver.deps.listSiteGroupMembers(siteUrl, group.id, token);
    for (const m of members) lines.push(`${group.id}|${String(m.loginName).toLowerCase()}`);
  }
  lines.sort();
  return crypto.createHash("sha256").update(lines.join("\n")).digest("hex");
}

const sameRows = (a, b) =>
  a.length === b.length &&
  a.every((r, i) => r.principalType === b[i].principalType && r.principalId === b[i].principalId);

/**
 * Re-read the permissions of every synced file of one site, and of its
 * pages when `site.pagesDriveId` is known (A-15). Unchanged ACLs only get
 * aclSyncedAt bumped. Items no longer in SharePoint are left alone
 * (deletion handling is FR-2 open question #4).
 * Returns { checked, updated, failed }.
 */
export async function refreshSiteAcls(db, { orgId, site, accessToken, resolver, deps = {} }) {
  const graph = { getDelta, getDriveDelta, getSiteDriveId, ...deps };
  const stats = { checked: 0, updated: 0, failed: 0 };

  const { items: fileItems } = await graph.getDelta({ accessToken, siteId: site.siteId });
  const files = fileItems.filter((i) => i.file && !i.deleted);
  if (files.length) {
    const siteDriveId = await graph.getSiteDriveId({ accessToken, siteId: site.siteId });
    await refreshDriveAcls(db, { orgId, site, items: files, fallbackDriveId: siteDriveId, contentType: "file", resolver, stats });
  }

  if (site.pagesDriveId) {
    const { items: pageItems } = await graph.getDriveDelta({ accessToken, driveId: site.pagesDriveId });
    const pages = pageItems.filter((i) => isPageItem(i) && !i.deleted);
    if (pages.length) {
      await refreshDriveAcls(db, { orgId, site, items: pages, fallbackDriveId: site.pagesDriveId, contentType: "page", resolver, stats });
    }
  }
  return stats;
}

async function refreshDriveAcls(db, { orgId, site, items, fallbackDriveId, contentType, resolver, stats }) {
  const byId = new Map(items.map((i) => [i.id, i]));
  const docs = await db.document.findMany({
    where: { orgId, sourceProvider: "sharepoint", contentType, externalId: { in: [...byId.keys()] } },
    select: {
      id: true,
      externalId: true,
      externalUrl: true,
      externalContainerId: true,
      aclSyncedAt: true,
      acl: { where: { source: "sharepoint" }, select: { principalType: true, principalId: true } },
    },
  });

  const unchanged = [];
  for (const doc of docs) {
    stats.checked++;
    const item = byId.get(doc.externalId);
    const driveId = item.parentReference?.driveId || fallbackDriveId;
    try {
      const rows = await resolver.itemAcl({ driveId, itemId: item.id, siteUrl: site.siteUrl });
      const current = [...doc.acl].sort((a, b) =>
        `${a.principalType}:${a.principalId}` < `${b.principalType}:${b.principalId}` ? -1 : 1
      );
      // A page's link is the page URL set at sync time; only files take the item's webUrl.
      const webUrl = contentType === "file" ? item.webUrl : null;
      const sourceChanged = (webUrl && webUrl !== doc.externalUrl) || (driveId && driveId !== doc.externalContainerId);
      if (doc.aclSyncedAt && sameRows(rows, current) && !sourceChanged) {
        unchanged.push(doc.id);
        continue;
      }
      await db.document.update({
        where: { id: doc.id },
        data: { ...aclWriteData(rows), externalUrl: webUrl || undefined, externalContainerId: driveId || undefined },
      });
      stats.updated++;
    } catch (err) {
      stats.failed++;
      console.error(`❌ ACL refresh failed for ${doc.externalId}:`, err.message);
    }
  }
  if (unchanged.length) {
    await db.document.updateMany({ where: { id: { in: unchanged } }, data: { aclSyncedAt: new Date() } });
  }
}

/**
 * The daily pass for one org: identities first (so a user matched today
 * sees their files right away), then every site's files.
 */
export async function refreshIntegrationAcls(db, { integration, accessToken, resolver, deps = {} }) {
  const { tenantId, sites = [] } = integration.scopeConfig || {};
  const result = { identities: null, groups: { updated: 0, deleted: 0, failed: 0 }, sites: [] };

  result.identities = await syncEmailMatchIdentities(db, { orgId: integration.orgId, tenantId, deps: deps.identity });
  const members = await db.organizationMember.findMany({ where: { orgId: integration.orgId }, select: { userId: true } });
  const identities = await db.userIdentity.findMany({
    where: { provider: "entra", tenantId, userId: { in: members.map((m) => m.userId) } },
  });
  for (const identity of identities) {
    try {
      const outcome = await refreshIdentityGroups(db, identity, { deps: deps.identity });
      result.groups[outcome]++;
    } catch (err) {
      result.groups.failed++;
      console.error("❌ Group refresh failed:", err.message);
    }
  }

  if (resolver) {
    for (const site of sites) {
      try {
        const stats = await refreshSiteAcls(db, { orgId: integration.orgId, site, accessToken, resolver, deps: deps.graph });
        result.sites.push({ siteUrl: site.siteUrl, ...stats });
      } catch (err) {
        result.sites.push({ siteUrl: site.siteUrl, error: err.message });
      }
    }
  }
  return result;
}
