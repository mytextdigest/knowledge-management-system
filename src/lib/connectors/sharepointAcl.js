// EKP Workstream A (A-9): who can see a SharePoint item, as DocumentAcl rows.
//
// Graph's item permissions list direct grants (users, Entra groups, sharing
// links) and SharePoint site groups (Owners / Members / Visitors, ids unique
// per site only). Site groups are expanded here, at sync time, through
// SharePoint REST, so the query-time check (F1, A-10) only ever matches
// Entra ids:
//
//   principalType  principalId          who
//   user           Entra user object id that user
//   group          Entra group id       its (transitive) members
//   group_owners   Entra group id       its owners (Microsoft 365 group "_o" logins)
//   tenant         tenant id            everyone in the tenant (org-wide and
//                                       "anyone" links, "Everyone" claims)
//
// Any role (read / write / owner) means the principal can see the item.
// Unknown principal kinds are ignored, which only ever narrows access.
// Design and the shapes Graph returns: WS_A_M365_CONNECTORS.md §7 (A-8).
//
// Imported by the worker, so relative imports only.

import { getItemPermissions, getUserIdByUpn } from "../msGraph.js";
import { getSharePointToken, isSharePointCertConfigured, listSiteGroupMembers } from "./sharepointRest.js";

export const PRINCIPAL_TYPES = ["user", "group", "group_owners", "tenant"];

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * One SharePoint claims login name → a principal, `{ upn }` (a user who has
 * to be looked up), or null (ignored: SHAREPOINT\system, apps, unknown).
 */
export function principalFromLoginName(loginName, tenantId) {
  const login = String(loginName || "");
  const lower = login.toLowerCase();

  // Microsoft 365 group: members, or owners with the "_o" suffix.
  let m = lower.match(/^c:0o\.c\|federateddirectoryclaimprovider\|([0-9a-f-]{36})(_o)?$/);
  if (m) return { principalType: m[2] ? "group_owners" : "group", principalId: m[1] };

  // Entra security group.
  m = lower.match(/^c:0t\.c\|tenant\|([0-9a-f-]{36})$/);
  if (m) return { principalType: "group", principalId: m[1] };

  // "Everyone except external users" and "Everyone".
  if (lower.startsWith("c:0-.f|rolemanager|spo-grid-all-users") || lower === "c:0(.s|true") {
    return { principalType: "tenant", principalId: tenantId };
  }

  // A user (Entra account).
  m = login.match(/^i:0#\.f\|membership\|(.+)$/i);
  if (m) return { upn: m[1].toLowerCase() };

  return null;
}

function principalFromIdentitySet(identity, tenantId) {
  if (!identity) return null;
  const loginName = identity.siteUser?.loginName;
  if (identity.group?.id && GUID.test(identity.group.id)) {
    const owners = /_o$/i.test(loginName || "");
    return { principalType: owners ? "group_owners" : "group", principalId: identity.group.id.toLowerCase() };
  }
  if (identity.user?.id && GUID.test(identity.user.id)) {
    return { principalType: "user", principalId: identity.user.id.toLowerCase() };
  }
  if (loginName) return principalFromLoginName(loginName, tenantId);
  return null;
}

/**
 * Graph permission entries → what they grant, before site groups and UPNs
 * are resolved: { principals, siteGroupIds, upns }.
 */
export function parsePermissions(permissions, { tenantId }) {
  const principals = [];
  const siteGroupIds = new Set();
  const upns = new Set();
  const add = (p) => {
    if (!p) return;
    if (p.upn) upns.add(p.upn);
    else principals.push(p);
  };

  for (const perm of permissions || []) {
    if (!perm.roles?.length) continue;

    // Sharing links: org-wide and anonymous links let anyone in the tenant in
    // (KMS never shows anything to people outside the org). "Specific
    // people" links list their recipients.
    if (perm.link) {
      if (perm.link.scope === "organization" || perm.link.scope === "anonymous") {
        add({ principalType: "tenant", principalId: tenantId });
      }
      for (const identity of perm.grantedToIdentitiesV2 || []) add(principalFromIdentitySet(identity, tenantId));
      continue;
    }

    const granted = perm.grantedToV2;
    if (!granted) continue;
    if (granted.siteGroup?.id) {
      siteGroupIds.add(String(granted.siteGroup.id));
      continue;
    }
    add(principalFromIdentitySet(granted, tenantId));
  }

  return { principals, siteGroupIds: [...siteGroupIds], upns: [...upns] };
}

export function dedupePrincipals(principals) {
  const seen = new Map();
  for (const p of principals) {
    if (!p?.principalId || !PRINCIPAL_TYPES.includes(p.principalType)) continue;
    seen.set(`${p.principalType}:${p.principalId}`, p);
  }
  return [...seen.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([, p]) => p);
}

/**
 * Resolves item ACLs for one sync run. Site-group members and UPN lookups
 * are cached for the life of the resolver (one run), so a site with 5,000
 * files costs one REST call per site group, not per file.
 */
export class SharePointAclResolver {
  constructor({ graphToken, tenantId, deps = {} }) {
    this.graphToken = graphToken;
    this.tenantId = tenantId;
    this.deps = {
      getItemPermissions,
      getUserIdByUpn,
      getSharePointToken,
      listSiteGroupMembers,
      ...deps,
    };
    this.siteGroups = new Map(); // `${siteUrl}|${groupId}` → Promise<{ principals, upns }>
    this.upns = new Map(); // upn → Promise<objectId | null>
  }

  setGraphToken(token) {
    this.graphToken = token;
  }

  siteGroupMembers(siteUrl, groupId) {
    const key = `${siteUrl}|${groupId}`;
    if (!this.siteGroups.has(key)) {
      const load = (async () => {
        const host = new URL(siteUrl).host;
        const token = await this.deps.getSharePointToken(this.tenantId, host);
        const members = await this.deps.listSiteGroupMembers(siteUrl, groupId, token);
        const principals = [];
        const upns = [];
        for (const member of members) {
          const p = principalFromLoginName(member.loginName, this.tenantId);
          if (p?.upn) upns.push(p.upn);
          else if (p) principals.push(p);
        }
        return { principals, upns };
      })();
      // Don't cache a failure: the next file retries.
      load.catch(() => this.siteGroups.delete(key));
      this.siteGroups.set(key, load);
    }
    return this.siteGroups.get(key);
  }

  userIdForUpn(upn) {
    if (!this.upns.has(upn)) {
      const load = this.deps.getUserIdByUpn({ accessToken: this.graphToken, upn });
      load.catch(() => this.upns.delete(upn));
      this.upns.set(upn, load);
    }
    return this.upns.get(upn);
  }

  /** Expand parsed permissions into final rows (site groups, UPNs resolved). */
  async expand({ principals, siteGroupIds, upns }, { siteUrl }) {
    const all = [...principals];
    const allUpns = new Set(upns);
    for (const groupId of siteGroupIds) {
      const members = await this.siteGroupMembers(siteUrl, groupId);
      all.push(...members.principals);
      for (const upn of members.upns) allUpns.add(upn);
    }
    for (const upn of allUpns) {
      const id = await this.userIdForUpn(upn);
      if (id) all.push({ principalType: "user", principalId: id.toLowerCase() });
    }
    return dedupePrincipals(all);
  }

  /** The DocumentAcl rows for one drive item. */
  async itemAcl({ driveId, itemId, siteUrl }) {
    const permissions = await this.deps.getItemPermissions({ accessToken: this.graphToken, driveId, itemId });
    return this.expand(parsePermissions(permissions, { tenantId: this.tenantId }), { siteUrl });
  }
}

/**
 * A resolver for a sync run, or null when per-file permissions can't be
 * captured (no certificate configured, so site groups can't be expanded).
 * With null, synced documents keep today's department-only access.
 */
export function createAclResolver({ graphToken, tenantId }) {
  if (!tenantId || !isSharePointCertConfigured()) return null;
  return new SharePointAclResolver({ graphToken, tenantId });
}

/**
 * Prisma `data` that replaces a document's SharePoint ACL rows and stamps
 * aclSyncedAt. Pass { create: true } inside document.create().
 */
export function aclWriteData(rows, { create = false, now = new Date() } = {}) {
  const rowsData = rows.map((r) => ({ principalType: r.principalType, principalId: r.principalId, source: "sharepoint" }));
  return {
    aclSyncedAt: now,
    acl: create ? { create: rowsData } : { deleteMany: { source: "sharepoint" }, create: rowsData },
  };
}
