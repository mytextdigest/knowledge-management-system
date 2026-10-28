// A-21: email_match identities and A-10 group refresh
// (src/lib/identity/entraIdentity.js, groupCache.js). Graph is stubbed; DB cases run inside
// a transaction that is always rolled back.
// Run: EKP_DB_TESTS=1 npm run ekp:a21:test
import test from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import {
  ensureFreshPrincipals,
  refreshUserGroups,
  resetPrincipalMemo,
  syncEmailMatchIdentities,
} from "../../src/lib/identity/entraIdentity.js";
import { clearCachedGroups, getCachedGroups, groupsAreStale, setCachedGroups } from "../../src/lib/identity/groupCache.js";

const RUN_DB_TESTS = process.env.EKP_DB_TESTS === "1";
const ROLLBACK = Symbol("rollback");

// A fake tenant directory: email → [{ id, accountEnabled }].
function graph(directory, groups = {}) {
  const calls = { lookups: 0, groups: 0 };
  return {
    calls,
    deps: {
      getToken: async () => "token",
      findUsersByEmails: async ({ emails }) => {
        calls.lookups++;
        return new Map(emails.map((e) => [e.toLowerCase(), directory[e.toLowerCase()] || []]));
      },
      getUserGroupIds: async ({ userId }) => {
        calls.groups++;
        return groups[userId] === undefined ? { groupIds: [], ownedGroupIds: [] } : groups[userId];
      },
    },
  };
}

async function withDb(fn) {
  const prisma = new PrismaClient();
  try {
    await prisma.$transaction(async (db) => {
      await fn(db);
      throw ROLLBACK;
    }, { timeout: 60_000, maxWait: 20_000 });
  } catch (err) {
    if (err !== ROLLBACK) throw err;
  } finally {
    await prisma.$disconnect();
  }
}

async function seed(db) {
  const tag = `${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
  const tenantId = `tenant-${tag}`;
  const org = await db.organization.create({ data: { name: `a21-${tag}` } });
  await db.orgIntegration.create({
    data: { orgId: org.id, provider: "sharepoint", scopeConfig: { tenantId, sites: [] }, accessToken: "x", tokenExpiry: new Date() },
  });
  const mk = async (name, data = {}) => {
    const user = await db.user.create({ data: { email: `${name}-${tag}@contoso.test`, emailVerified: true, ...data } });
    await db.organizationMember.create({ data: { orgId: org.id, userId: user.id, role: "employee" } });
    return user;
  };
  return { tag, tenantId, org, mk };
}

const identitiesOf = (db, userId) => db.userIdentity.findMany({ where: { userId }, orderBy: { createdAt: "asc" } });

test("email match: one enabled match links; none, several, disabled or unverified don't", { skip: !RUN_DB_TESTS }, async () => {
  await withDb(async (db) => {
    const { tenantId, org, mk } = await seed(db);
    const alice = await mk("alice");
    const bob = await mk("bob");
    const carol = await mk("carol");
    const dave = await mk("dave");
    const erin = await mk("erin", { emailVerified: false });
    const { deps } = graph({
      [alice.email]: [{ id: "AAAAAAAA-0000-0000-0000-000000000001", accountEnabled: true }],
      [carol.email]: [{ id: "c1", accountEnabled: true }, { id: "c2", accountEnabled: true }],
      [dave.email]: [{ id: "d1", accountEnabled: false }],
      [erin.email]: [{ id: "e1", accountEnabled: true }],
    });

    const stats = await syncEmailMatchIdentities(db, { orgId: org.id, tenantId, deps });
    assert.deepEqual(stats, { checked: 5, matched: 1, unchanged: 0, removed: 0, conflicts: 0 });
    const [a] = await identitiesOf(db, alice.id);
    assert.equal(a.source, "email_match");
    assert.equal(a.externalId, "aaaaaaaa-0000-0000-0000-000000000001", "object ids stored lowercased");
    assert.ok(a.verifiedAt);
    for (const u of [bob, carol, dave, erin]) assert.equal((await identitiesOf(db, u.id)).length, 0, u.email);
  });
});

test("email match: re-check keeps, re-points or removes; sso wins; one Entra account, one KMS user", { skip: !RUN_DB_TESTS }, async () => {
  await withDb(async (db) => {
    const { tenantId, org, mk } = await seed(db);
    const alice = await mk("alice");
    const sam = await mk("sam");
    const twin = await mk("twin");
    await db.userIdentity.create({ data: { userId: sam.id, provider: "entra", source: "sso", tenantId, externalId: "s1" } });
    // twin's email resolves to the Entra account sam already signed in with.
    const directory = {
      [alice.email]: [{ id: "a1", accountEnabled: true }],
      [sam.email]: [{ id: "s-other", accountEnabled: true }],
      [twin.email]: [{ id: "s1", accountEnabled: true }],
    };
    const first = await syncEmailMatchIdentities(db, { orgId: org.id, tenantId, deps: graph(directory).deps });
    assert.equal(first.matched, 1);
    assert.equal(first.conflicts, 1);
    assert.deepEqual((await identitiesOf(db, sam.id)).map((i) => [i.source, i.externalId]), [["sso", "s1"]], "sso untouched");
    assert.equal((await identitiesOf(db, twin.id)).length, 0);

    assert.equal((await syncEmailMatchIdentities(db, { orgId: org.id, tenantId, deps: graph(directory).deps })).unchanged, 1);

    directory[alice.email] = [{ id: "a2", accountEnabled: true }];
    await syncEmailMatchIdentities(db, { orgId: org.id, tenantId, deps: graph(directory).deps });
    assert.deepEqual((await identitiesOf(db, alice.id)).map((i) => i.externalId), ["a2"], "re-pointed");

    directory[alice.email] = [{ id: "a2", accountEnabled: false }];
    const off = await syncEmailMatchIdentities(db, { orgId: org.id, tenantId, deps: graph(directory).deps });
    assert.equal(off.removed, 1);
    assert.equal((await identitiesOf(db, alice.id)).length, 0, "disabled account → identity removed");
  });
});

test("groups: read into the cache across identities; a deleted Entra account drops email_match, keeps sso", { skip: !RUN_DB_TESTS }, async () => {
  await withDb(async (db) => {
    clearCachedGroups();
    const { tenantId, mk } = await seed(db);
    const alice = await mk("alice");
    const sam = await mk("sam");
    await db.userIdentity.create({ data: { userId: alice.id, provider: "entra", source: "email_match", tenantId, externalId: "a1" } });
    await db.userIdentity.create({ data: { userId: sam.id, provider: "entra", source: "sso", tenantId, externalId: "s1" } });
    const { deps } = graph({}, { a1: { groupIds: ["G2", "g1"], ownedGroupIds: ["g2"] }, s1: null });

    await refreshUserGroups(db, alice.id, { deps });
    assert.deepEqual(getCachedGroups(alice.id).groupIds, ["g1", "g2"], "lowercased, sorted");
    assert.deepEqual(getCachedGroups(alice.id).ownedGroupIds, ["g2"]);

    await refreshUserGroups(db, sam.id, { deps });
    assert.deepEqual(getCachedGroups(sam.id).groupIds, []);
    assert.equal((await identitiesOf(db, sam.id)).length, 1, "sso link kept even if Graph no longer knows the account");

    await refreshUserGroups(db, alice.id, { deps: graph({}, { a1: null }).deps });
    assert.equal((await identitiesOf(db, alice.id)).length, 0, "email_match removed for a vanished account");
    assert.deepEqual(getCachedGroups(alice.id).groupIds, []);
    clearCachedGroups();
  });
});

test("group cache: stale after 15 min, dropped after 24 h", () => {
  clearCachedGroups();
  const t0 = Date.UTC(2026, 9, 26);
  assert.equal(groupsAreStale("u", t0), true, "unknown user");
  setCachedGroups("u", { groupIds: ["g"] }, t0);
  assert.equal(groupsAreStale("u", t0 + 10 * 60_000), false);
  assert.equal(groupsAreStale("u", t0 + 16 * 60_000), true);
  assert.deepEqual(getCachedGroups("u", t0 + 23 * 3600_000).groupIds, ["g"], "stale but still used until refreshed");
  assert.deepEqual(getCachedGroups("u", t0 + 25 * 3600_000).groupIds, [], "fails closed after 24 h");
  clearCachedGroups();
});

test("request path: matches a new user, then only refreshes stale groups; never throws", { skip: !RUN_DB_TESTS }, async () => {
  await withDb(async (db) => {
    resetPrincipalMemo();
    clearCachedGroups();
    const { mk } = await seed(db);
    const alice = await mk("alice");
    const g = graph({ [alice.email]: [{ id: "a1", accountEnabled: true }] }, { a1: { groupIds: ["g1"], ownedGroupIds: [] } });
    const t0 = Date.now();

    await ensureFreshPrincipals(db, alice.id, { deps: g.deps, now: t0 });
    assert.equal((await identitiesOf(db, alice.id))[0].externalId, "a1");
    assert.deepEqual(getCachedGroups(alice.id).groupIds, ["g1"]);
    assert.deepEqual([g.calls.lookups, g.calls.groups], [1, 1]);

    await ensureFreshPrincipals(db, alice.id, { deps: g.deps, now: t0 + 30_000 });
    assert.deepEqual([g.calls.lookups, g.calls.groups], [1, 1], "checked at most once a minute");

    await ensureFreshPrincipals(db, alice.id, { deps: g.deps, now: t0 + 5 * 60_000 });
    assert.equal(g.calls.groups, 1, "fresh groups aren't re-read");

    await ensureFreshPrincipals(db, alice.id, { deps: g.deps, now: t0 + 20 * 60_000 });
    assert.equal(g.calls.groups, 2, "stale groups are re-read");

    const broken = { ...g.deps, getUserGroupIds: async () => { throw new Error("Graph down"); } };
    await ensureFreshPrincipals(db, alice.id, { deps: broken, now: t0 + 40 * 60_000 });
    assert.deepEqual(getCachedGroups(alice.id).groupIds, ["g1"], "a failed refresh keeps the last groups");
    clearCachedGroups();
  });
});
