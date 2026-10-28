// EKP Workstream A (A-10): the user's Entra groups, held in memory per
// server instance (no database column, so no migration). Filled by
// ensureFreshPrincipals (src/lib/identity/entraIdentity.js) from Graph,
// read synchronously by the access SQL (src/lib/access/documentAcl.js).
//
// A user with no entry is matched on their own object id and tenant only,
// so a cold cache narrows access, never widens it. Entries that couldn't be
// refreshed for 24 hours are dropped (fail closed).
//
// Plain module (no imports): used by the web app, the worker and plain-Node
// scripts alike.

export const GROUPS_MAX_AGE_MS = 15 * 60_000;
export const GROUPS_DROP_AFTER_MS = 24 * 60 * 60_000;

const cache = new Map(); // userId → { groupIds, ownedGroupIds, fetchedAt }
const EMPTY = Object.freeze({ groupIds: [], ownedGroupIds: [] });

/** The user's cached groups ({ groupIds, ownedGroupIds }), empty when unknown or too old. */
export function getCachedGroups(userId, now = Date.now()) {
  const entry = cache.get(userId);
  if (!entry) return EMPTY;
  if (now - entry.fetchedAt > GROUPS_DROP_AFTER_MS) {
    cache.delete(userId);
    return EMPTY;
  }
  return entry;
}

/** Whether the user's groups should be re-read from Graph. */
export function groupsAreStale(userId, now = Date.now()) {
  const entry = cache.get(userId);
  return !entry || now - entry.fetchedAt > GROUPS_MAX_AGE_MS;
}

export function setCachedGroups(userId, { groupIds = [], ownedGroupIds = [] }, now = Date.now()) {
  cache.set(userId, {
    groupIds: [...new Set(groupIds.map((g) => g.toLowerCase()))].sort(),
    ownedGroupIds: [...new Set(ownedGroupIds.map((g) => g.toLowerCase()))].sort(),
    fetchedAt: now,
  });
}

export function clearCachedGroups(userId) {
  if (userId === undefined) cache.clear();
  else cache.delete(userId);
}
