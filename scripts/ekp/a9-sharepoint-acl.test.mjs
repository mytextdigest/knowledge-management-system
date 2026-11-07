// A-9: SharePoint item permissions → DocumentAcl rows
// (src/lib/connectors/sharepointAcl.js). Uses the real permission entries of
// the NGI Engineering test files (fixtures/a9-engineering-permissions.json);
// Graph and SharePoint REST are stubbed.
// Run: npm run ekp:a9:test
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  SharePointAclResolver,
  aclWriteData,
  parsePermissions,
  principalFromLoginName,
} from "../../src/lib/connectors/sharepointAcl.js";

const fx = JSON.parse(fs.readFileSync(new URL("./fixtures/a9-engineering-permissions.json", import.meta.url), "utf8"));
const TID = fx.tenantId;
const M365 = "9e8c1fde-0258-4fdf-91fb-f33345e105e3";
const KMS_ENG = "d49e0395-9610-4d67-9e89-6b65fbe2be96";
const EMP1 = "0c6fc2ea-cee9-4616-848e-61e37d8ead94";
const EMP2 = "2e67824a-f6fd-4aa1-914e-d32a598914d4";

function resolver(extra = {}) {
  const calls = { siteGroups: 0, upns: [] };
  const r = new SharePointAclResolver({
    graphToken: "graph",
    tenantId: TID,
    deps: {
      getItemPermissions: async ({ itemId }) => [...fx.siteGroupEntries, ...(fx.extraEntries[itemId] || [])],
      getSharePointToken: async () => "sp",
      listSiteGroupMembers: async (_siteUrl, groupId) => {
        calls.siteGroups++;
        return fx.siteGroups[groupId] || [];
      },
      getUserIdByUpn: async ({ upn }) => {
        calls.upns.push(upn);
        return extra.upns?.[upn] ?? null;
      },
      ...extra.deps,
    },
  });
  return { r, calls };
}

const rows = (list) => list.map((p) => `${p.principalType}:${p.principalId}`);
const SITE_DEFAULT = [`group:${M365}`, `group_owners:${M365}`];

test("login names: M365 members/owners, security groups, everyone, users, ignored", () => {
  assert.deepEqual(principalFromLoginName(`c:0o.c|federateddirectoryclaimprovider|${M365}`, TID), { principalType: "group", principalId: M365 });
  assert.deepEqual(principalFromLoginName(`c:0o.c|federateddirectoryclaimprovider|${M365}_o`, TID), { principalType: "group_owners", principalId: M365 });
  assert.deepEqual(principalFromLoginName(`c:0t.c|tenant|${KMS_ENG.toUpperCase()}`, TID), { principalType: "group", principalId: KMS_ENG });
  assert.deepEqual(principalFromLoginName(`c:0-.f|rolemanager|spo-grid-all-users/${TID}`, TID), { principalType: "tenant", principalId: TID });
  assert.deepEqual(principalFromLoginName("c:0(.s|true", TID), { principalType: "tenant", principalId: TID });
  assert.deepEqual(principalFromLoginName("i:0#.f|membership|Emp3@Contoso.com", TID), { upn: "emp3@contoso.com" });
  assert.equal(principalFromLoginName("SHAREPOINT\\system", TID), null);
  assert.equal(principalFromLoginName("i:0i.t|00000003-0000-0ff1-ce00-000000000000|app@sharepoint", TID), null);
});

test("parse: site groups are collected, direct grants mapped, links → tenant", () => {
  const parsed = parsePermissions([...fx.siteGroupEntries, ...fx.extraEntries["everyone-link.docx"]], { tenantId: TID });
  assert.deepEqual(parsed.siteGroupIds.sort(), ["3", "4", "5"]);
  assert.deepEqual(rows(parsed.principals).sort(), [`group_owners:${M365}`, `tenant:${TID}`]);
  // A "specific people" link lists its recipients; an entry with no role grants nothing.
  const specific = parsePermissions([
    { roles: ["read"], link: { scope: "users", type: "view" }, grantedToIdentitiesV2: [{ user: { id: EMP2 } }] },
    { roles: [], grantedToV2: { user: { id: EMP1 } } },
  ], { tenantId: TID });
  assert.deepEqual(rows(specific.principals), [`user:${EMP2}`]);
});

test("the four test files expand to the expected rows", async () => {
  const { r, calls } = resolver();
  const acl = async (file) => rows(await r.itemAcl({ driveId: "d", itemId: file, siteUrl: fx.siteUrl }));
  assert.deepEqual(await acl("only-emp1.docx"), [`group:${M365}`, `group_owners:${M365}`, `user:${EMP1}`]);
  assert.deepEqual(await acl("engineering-group.docx"), [`group:${M365}`, `group:${KMS_ENG}`, `group_owners:${M365}`]);
  assert.deepEqual(await acl("everyone-link.docx"), [`group:${M365}`, `group_owners:${M365}`, `tenant:${TID}`]);
  assert.deepEqual(await acl("site-default.docx"), [`group:${M365}`, `group_owners:${M365}`, `user:${EMP2}`]);
  assert.deepEqual(await acl("not-shared.docx"), SITE_DEFAULT);
  assert.equal(calls.siteGroups, 3, "each site group is read once per run");
});

test("site-group users given by UPN are resolved once; unknown users dropped", async () => {
  fx.siteGroups["4"] = [
    { loginName: "i:0#.f|membership|emp3@nextgenerationinnovation.onmicrosoft.com", principalType: 1 },
    { loginName: "i:0#.f|membership|gone@nextgenerationinnovation.onmicrosoft.com", principalType: 1 },
  ];
  try {
    const { r, calls } = resolver({ upns: { "emp3@nextgenerationinnovation.onmicrosoft.com": "4A7EB0E1-A3FD-4109-862F-66358B194F17" } });
    const a = rows(await r.itemAcl({ driveId: "d", itemId: "x", siteUrl: fx.siteUrl }));
    await r.itemAcl({ driveId: "d", itemId: "y", siteUrl: fx.siteUrl });
    assert.ok(a.includes("user:4a7eb0e1-a3fd-4109-862f-66358b194f17"));
    assert.equal(a.filter((p) => p.startsWith("user:")).length, 1);
    assert.equal(calls.upns.length, 2, "each UPN looked up once");
  } finally {
    fx.siteGroups["4"] = [];
  }
});

test("a failing site-group read fails the file (never stored without its ACL) and isn't cached", async () => {
  let fail = true;
  const { r } = resolver({
    deps: {
      listSiteGroupMembers: async (_s, groupId) => {
        if (fail) throw new Error("401");
        return fx.siteGroups[groupId] || [];
      },
    },
  });
  await assert.rejects(r.itemAcl({ driveId: "d", itemId: "x", siteUrl: fx.siteUrl }), /401/);
  fail = false;
  assert.deepEqual(rows(await r.itemAcl({ driveId: "d", itemId: "x", siteUrl: fx.siteUrl })), SITE_DEFAULT);
});

test("aclWriteData: replace on update, plain create on create, stamps aclSyncedAt", () => {
  const now = new Date("2026-10-23T00:00:00Z");
  const r = [{ principalType: "user", principalId: EMP1 }];
  assert.deepEqual(aclWriteData(r, { now }), {
    aclSyncedAt: now,
    acl: { deleteMany: { source: "sharepoint" }, create: [{ principalType: "user", principalId: EMP1, source: "sharepoint" }] },
  });
  assert.deepEqual(aclWriteData([], { create: true, now }).acl, { create: [] });
});

test("delta: a cursor Graph rejects with 410 restarts the listing from the beginning", async () => {
  const { getDriveDelta } = await import("../../src/lib/msGraph.js");
  const realFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    if (String(url).includes("token=old")) return new Response(JSON.stringify({ error: { code: "resyncRequired", message: "Resync required" } }), { status: 410 });
    if (String(url).endsWith("/root/delta")) return Response.json({ value: [{ id: "a" }], "@odata.nextLink": "https://graph/next" });
    return Response.json({ value: [{ id: "b" }], "@odata.deltaLink": "https://graph/delta?token=new" });
  };
  const origWarn = console.warn;
  console.warn = () => {};
  try {
    const r = await getDriveDelta({ accessToken: "t", driveId: "d", cursor: "https://graph/delta?token=old", sharingChanges: true });
    assert.deepEqual(r.items.map((i) => i.id), ["a", "b"]);
    assert.equal(r.deltaLink, "https://graph/delta?token=new");
    assert.equal(r.restarted, true);
    // Without a cursor, a 410 is a real error.
    globalThis.fetch = async () => new Response(JSON.stringify({ error: { message: "gone" } }), { status: 410 });
    await assert.rejects(getDriveDelta({ accessToken: "t", driveId: "d" }), /410/);
  } finally {
    globalThis.fetch = realFetch;
    console.warn = origWarn;
  }
});
