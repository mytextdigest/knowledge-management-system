// A-11: keeping SharePoint permissions current
// (src/lib/connectors/sharepointAclRefresh.js, the sharepoint.acl-refresh job).
// Graph and SharePoint REST are stubbed; DB cases run inside a transaction
// that is always rolled back.
// Run: EKP_DB_TESTS=1 npm run ekp:a11:test
import test from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { SharePointAclResolver } from "../../src/lib/connectors/sharepointAcl.js";
import { refreshSiteAcls, siteGroupFingerprint } from "../../src/lib/connectors/sharepointAclRefresh.js";
import { JOB_DEFINITIONS, ensureOrgJobs } from "../../src/lib/jobs/registry.js";

const RUN_DB_TESTS = process.env.EKP_DB_TESTS === "1";
const ROLLBACK = Symbol("rollback");
const TID = "11111111-1111-1111-1111-111111111111";
const M365 = "eeeeeeee-0000-0000-0000-000000000002";
const SITE_URL = "https://contoso.sharepoint.com/sites/Eng";

// A fake site: site groups (id → logins) and per-item extra permissions.
function fakeSite() {
  const site = {
    groups: { 3: [`c:0o.c|federateddirectoryclaimprovider|${M365}_o`], 5: [`c:0o.c|federateddirectoryclaimprovider|${M365}`] },
    extra: {},
  };
  const resolver = () => new SharePointAclResolver({
    graphToken: "g",
    tenantId: TID,
    deps: {
      getSharePointToken: async () => "sp",
      listSiteGroups: async () => Object.keys(site.groups).map((id) => ({ id, title: `G${id}` })),
      listSiteGroupMembers: async (_u, id) => (site.groups[id] || []).map((loginName) => ({ loginName, principalType: 4 })),
      getItemPermissions: async ({ itemId }) => [
        ...Object.keys(site.groups).map((id) => ({ roles: ["read"], grantedToV2: { siteGroup: { id } } })),
        ...(site.extra[itemId] || []),
      ],
      getUserIdByUpn: async ({ upn }) => (upn.startsWith("emp3") ? "00000000-0000-0000-0000-0000000000e3" : null),
    },
  });
  return { site, resolver };
}

test("fingerprint changes when a site group's members change, not otherwise", async () => {
  const { site, resolver } = fakeSite();
  const a = await siteGroupFingerprint(resolver(), SITE_URL);
  assert.equal(await siteGroupFingerprint(resolver(), SITE_URL), a);
  site.groups[4] = ["i:0#.f|membership|emp3@contoso.com"];
  assert.notEqual(await siteGroupFingerprint(resolver(), SITE_URL), a);
});

test("fingerprint: groups with private membership (403) don't fail it; other errors do", async () => {
  const { resolver } = fakeSite();
  const r = resolver();
  const listSiteGroupMembers = r.deps.listSiteGroupMembers;
  r.deps.listSiteGroups = async () => [{ id: "3", title: "Owners" }, { id: "15", title: "Limited Access System Group For Web" }];
  r.deps.listSiteGroupMembers = async (u, id) => {
    if (id === "15") throw Object.assign(new Error("Access is denied."), { status: 403 });
    return listSiteGroupMembers(u, id);
  };
  assert.match(await siteGroupFingerprint(r, SITE_URL), /^[0-9a-f]{64}$/);
  r.deps.listSiteGroupMembers = async () => { throw Object.assign(new Error("Server error"), { status: 500 }); };
  await assert.rejects(siteGroupFingerprint(r, SITE_URL), /Server error/);
});

test("acl-refresh job: registered daily with a long lock; row only for connected orgs", () => {
  const def = JOB_DEFINITIONS["sharepoint.acl-refresh"];
  assert.equal(def.defaultIntervalMinutes, 1440);
  assert.ok(def.lockMinutes >= 60);
});

test("refreshSiteAcls re-reads every synced file, writes only changed ACLs, fills links", { skip: !RUN_DB_TESTS }, async () => {
  const prisma = new PrismaClient();
  const tag = `${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
  try {
    await prisma.$transaction(async (db) => {
      const org = await db.organization.create({ data: { name: `a11-${tag}` } });
      const admin = await db.user.create({ data: { email: `a11-${tag}@contoso.test` } });
      const mk = (externalId, data = {}) => db.document.create({
        data: { filename: externalId, userId: admin.id, orgId: org.id, scope: "repository", sourceProvider: "sharepoint", externalId, ...data },
      });
      const synced = await mk(`item-a-${tag}`, {
        aclSyncedAt: new Date("2026-01-01"),
        externalUrl: "https://x/a",
        acl: { create: [{ principalType: "group", principalId: M365 }, { principalType: "group_owners", principalId: M365 }] },
      });
      const legacy = await mk(`item-b-${tag}`); // synced before A-9: no ACL, no links
      const items = [
        { id: synced.externalId, file: {}, webUrl: "https://x/a", parentReference: { driveId: "drive-1" } },
        { id: legacy.externalId, file: {}, webUrl: "https://x/b", parentReference: { driveId: "drive-1" } },
        { id: `not-synced-${tag}`, file: {}, webUrl: "https://x/c" },
        { id: `folder-${tag}`, folder: {} },
      ];
      const deps = { getDelta: async () => ({ items }), getSiteDriveId: async () => "drive-1" };
      const { site, resolver } = fakeSite();
      const run = () => refreshSiteAcls(db, { orgId: org.id, site: { siteId: "s", siteUrl: SITE_URL }, accessToken: "g", resolver: resolver(), deps });

      assert.deepEqual(await run(), { checked: 2, updated: 1, failed: 0 }, "only the legacy file needed a write");
      const b = await db.document.findUnique({ where: { id: legacy.id }, include: { acl: true } });
      assert.ok(b.aclSyncedAt);
      assert.equal(b.externalUrl, "https://x/b");
      assert.equal(b.acl.length, 2);
      const a = await db.document.findUnique({ where: { id: synced.id } });
      assert.ok(a.aclSyncedAt > new Date("2026-01-01"), "unchanged ACL still gets aclSyncedAt bumped");

      // emp3 added to a site group → both files gain a user row.
      site.groups[4] = ["i:0#.f|membership|emp3@contoso.com"];
      assert.equal((await run()).updated, 2);
      const rows = await db.documentAcl.findMany({ where: { documentId: synced.id }, orderBy: { principalType: "asc" } });
      assert.deepEqual(rows.map((r) => r.principalType), ["group", "group_owners", "user"]);
      throw ROLLBACK;
    }, { timeout: 60_000, maxWait: 20_000 });
  } catch (err) {
    if (err !== ROLLBACK) throw err;
  } finally {
    await prisma.$disconnect();
  }
});

test("job rows: both SharePoint jobs appear for a connected org and start off", { skip: !RUN_DB_TESTS }, async () => {
  const prisma = new PrismaClient();
  const tag = `${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
  try {
    await prisma.$transaction(async (db) => {
      const org = await db.organization.create({ data: { name: `a11j-${tag}` } });
      await db.orgIntegration.create({
        data: { orgId: org.id, provider: "sharepoint", scopeConfig: { sites: [] }, accessToken: "x", tokenExpiry: new Date() },
      });
      await ensureOrgJobs(db, org.id);
      const rows = await db.scheduledJob.findMany({ where: { orgId: org.id }, orderBy: { name: "asc" } });
      assert.deepEqual(rows.map((r) => [r.name, r.enabled]), [["sharepoint.acl-refresh", false], ["sharepoint.sync", false]]);
      throw ROLLBACK;
    }, { timeout: 60_000, maxWait: 20_000 });
  } catch (err) {
    if (err !== ROLLBACK) throw err;
  } finally {
    await prisma.$disconnect();
  }
});
