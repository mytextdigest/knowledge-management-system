// EKP Workstream A: a KMS user's Entra identities and groups, the inputs of
// the per-file permission check (WS_A_M365_CONNECTORS.md §3.1).
//
// A-21 · email_match: a KMS user who never signs in with Microsoft is linked
//   to the Entra account whose UPN or mail equals their verified KMS email,
//   if there is exactly one enabled match in the tenant of an org they belong
//   to that has SharePoint connected. Zero or several matches → no identity
//   (fails closed). An `sso` identity (Microsoft sign-in) always wins, and an
//   Entra account is never linked to two KMS users.
// A-10 · groups: each identity stores the user's transitive group ids and the
//   groups they own (UserIdentity.groupIds / ownedGroupIds), refreshed when
//   older than 15 minutes, so the F1 predicate can match DocumentAcl rows in
//   SQL without any Graph call at query time.
//
// All Graph calls use the SharePoint connector app (User.Read.All,
// GroupMember.Read.All). Imported by the worker, so relative imports only.

import { findUsersByEmails, getCachedAppOnlyToken, getUserGroupIds } from "../msGraph.js";

export const GROUPS_MAX_AGE_MS = 15 * 60_000;
// If groups can't be refreshed for this long, drop them (fail closed).
const GROUPS_DROP_AFTER_MS = 24 * 60 * 60_000;
// Request path: check a user at most this often per server instance...
const RECHECK_MS = 60_000;
// ...and retry a failed email match at most this often.
const NO_MATCH_RETRY_MS = 60 * 60_000;

const defaultDeps = { getToken: getCachedAppOnlyToken, findUsersByEmails, getUserGroupIds };

/** Orgs with SharePoint connected, and their tenant: [{ orgId, tenantId }]. */
export async function sharePointTenants(db, { orgIds } = {}) {
  const rows = await db.orgIntegration.findMany({
    where: { provider: "sharepoint", status: "connected", ...(orgIds ? { orgId: { in: orgIds } } : {}) },
    select: { orgId: true, scopeConfig: true },
  });
  return rows.map((r) => ({ orgId: r.orgId, tenantId: r.scopeConfig?.tenantId })).filter((r) => r.tenantId);
}

/**
 * A-21: create, re-point or remove email_match identities for an org's
 * members (or just `userIds`) in its SharePoint tenant.
 */
export async function syncEmailMatchIdentities(db, { orgId, tenantId, userIds, deps = {}, now = new Date() }) {
  const { getToken, findUsersByEmails: findUsers } = { ...defaultDeps, ...deps };
  const members = await db.organizationMember.findMany({
    where: { orgId, ...(userIds ? { userId: { in: userIds } } : {}) },
    select: { user: { select: { id: true, email: true, emailVerified: true } } },
  });
  const users = members.map((m) => m.user);
  const identities = await db.userIdentity.findMany({
    where: { provider: "entra", tenantId, userId: { in: users.map((u) => u.id) } },
  });
  const ssoUserIds = new Set(identities.filter((i) => i.source === "sso").map((i) => i.userId));
  const candidates = users.filter((u) => !ssoUserIds.has(u.id));

  const stats = { checked: 0, matched: 0, unchanged: 0, removed: 0, conflicts: 0 };
  if (!candidates.length) return stats;

  const verified = candidates.filter((u) => u.emailVerified && u.email);
  const matches = verified.length
    ? await findUsers({ accessToken: await getToken(tenantId), emails: verified.map((u) => u.email) })
    : new Map();

  for (const user of candidates) {
    stats.checked++;
    const current = identities.find((i) => i.userId === user.id && i.source === "email_match");
    const found = user.emailVerified && user.email ? matches.get(user.email.toLowerCase()) || [] : [];
    const enabled = found.filter((u) => u.accountEnabled !== false);
    const target = enabled.length === 1 ? enabled[0].id.toLowerCase() : null;

    if (!target) {
      if (current) {
        await db.userIdentity.delete({ where: { id: current.id } });
        stats.removed++;
      }
      continue;
    }
    if (current?.externalId === target) {
      await db.userIdentity.update({ where: { id: current.id }, data: { verifiedAt: now } });
      stats.unchanged++;
      continue;
    }

    const holder = await db.userIdentity.findUnique({
      where: { provider_tenantId_externalId: { provider: "entra", tenantId, externalId: target } },
      select: { userId: true },
    });
    if (holder && holder.userId !== user.id) {
      if (current) await db.userIdentity.delete({ where: { id: current.id } });
      stats.conflicts++;
      continue;
    }

    const fresh = { externalId: target, email: user.email, verifiedAt: now, groupIds: [], ownedGroupIds: [], groupsSyncedAt: null };
    if (current) {
      await db.userIdentity.update({ where: { id: current.id }, data: fresh });
    } else {
      await db.userIdentity.create({
        data: { ...fresh, userId: user.id, provider: "entra", source: "email_match", tenantId },
      });
    }
    stats.matched++;
  }
  return stats;
}

/**
 * A-10: re-read one identity's groups. An email_match identity whose Entra
 * account is gone is deleted; an sso identity keeps the link, without groups.
 * Returns "updated" | "deleted".
 */
export async function refreshIdentityGroups(db, identity, { deps = {}, now = new Date() } = {}) {
  const { getToken, getUserGroupIds: getGroups } = { ...defaultDeps, ...deps };
  const groups = await getGroups({ accessToken: await getToken(identity.tenantId), userId: identity.externalId });
  if (!groups && identity.source === "email_match") {
    await db.userIdentity.delete({ where: { id: identity.id } });
    return "deleted";
  }
  await db.userIdentity.update({
    where: { id: identity.id },
    data: { groupIds: groups?.groupIds ?? [], ownedGroupIds: groups?.ownedGroupIds ?? [], groupsSyncedAt: now },
  });
  return "updated";
}

const lastChecked = new Map(); // userId → ms
const noMatchUntil = new Map(); // `${userId}|${tenantId}` → ms
const inFlight = new Map(); // userId → Promise

/**
 * Request path (resolveOrgRole) and sign-in: make sure the user's identities
 * in their orgs' SharePoint tenants exist and their groups are fresh.
 * Never throws; a failure leaves the previous state (dropped after 24 h).
 */
export function ensureFreshPrincipals(db, userId, { force = false, deps = {}, now = Date.now() } = {}) {
  if (!userId) return Promise.resolve();
  if (!force && now - (lastChecked.get(userId) ?? 0) < RECHECK_MS) return Promise.resolve();
  if (inFlight.has(userId)) return inFlight.get(userId);

  const run = (async () => {
    lastChecked.set(userId, now);
    const memberships = await db.organizationMember.findMany({ where: { userId }, select: { orgId: true } });
    if (!memberships.length) return;
    const tenants = await sharePointTenants(db, { orgIds: memberships.map((m) => m.orgId) });
    if (!tenants.length) return;

    for (const { orgId, tenantId } of tenants) {
      const key = `${userId}|${tenantId}`;
      const has = await db.userIdentity.count({ where: { userId, provider: "entra", tenantId } });
      if (!has && (force || now >= (noMatchUntil.get(key) ?? 0))) {
        try {
          const stats = await syncEmailMatchIdentities(db, { orgId, tenantId, userIds: [userId], deps });
          if (!stats.matched) noMatchUntil.set(key, now + NO_MATCH_RETRY_MS);
        } catch (err) {
          noMatchUntil.set(key, now + NO_MATCH_RETRY_MS);
          console.error("Entra email match failed:", err.message);
        }
      }
    }

    const stale = await db.userIdentity.findMany({
      where: {
        userId,
        provider: "entra",
        tenantId: { in: tenants.map((t) => t.tenantId) },
        OR: [{ groupsSyncedAt: null }, { groupsSyncedAt: { lt: new Date(now - GROUPS_MAX_AGE_MS) } }],
      },
    });
    for (const identity of stale) {
      try {
        await refreshIdentityGroups(db, identity, { deps });
      } catch (err) {
        console.error("Couldn't refresh the user's Microsoft groups:", err.message);
        if (identity.groupsSyncedAt && now - identity.groupsSyncedAt.getTime() > GROUPS_DROP_AFTER_MS) {
          await db.userIdentity.update({ where: { id: identity.id }, data: { groupIds: [], ownedGroupIds: [] } });
        }
      }
    }
  })()
    .catch((err) => console.error("ensureFreshPrincipals failed:", err.message))
    .finally(() => inFlight.delete(userId));

  inFlight.set(userId, run);
  return run;
}

/** Test hook: forget the request-path memo. */
export function resetPrincipalMemo() {
  lastChecked.clear();
  noMatchUntil.clear();
}
