// A-17: ServiceNow Knowledge Base connector (src/lib/connectors/servicenow*.js).
// ServiceNow's Table API is stubbed; DB cases run inside a transaction that is
// always rolled back.
// Run: EKP_DB_TESTS=1 npm run ekp:a17:test
import test from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { normalizeInstanceUrl, listArticles, listKnowledgeBases, parseServiceNowTime } from "../../src/lib/connectors/servicenowApi.js";
import { ServiceNowConnector, articleText } from "../../src/lib/connectors/servicenow.js";
import { validateConnectBody, mergeKnowledgeBases } from "../../src/lib/connectors/servicenowSettings.js";
import { syncServiceNow } from "../../src/lib/connectors/servicenowSync.js";
import { canAccessDocument, searchAccessWhere, getUserPrincipals } from "../../src/lib/access/documentAccess.js";
import { JOB_DEFINITIONS } from "../../src/lib/jobs/registry.js";

const RUN_DB_TESTS = process.env.EKP_DB_TESTS === "1";
const ROLLBACK = Symbol("rollback");
const INSTANCE = "https://dev1.service-now.com";
const BASIC = { type: "basic", username: "kms.integration", password: "pw" };

// A fake Table API: records every request, serves `tables[name]` filtered by
// the kb_knowledge_baseIN clause and paged by sysparm_offset/limit.
function fakeTableApi(tables, { status = 200 } = {}) {
  const requests = [];
  const fetchImpl = async (url, init) => {
    const u = new URL(url);
    requests.push({ url: u, headers: init?.headers || {} });
    if (status !== 200) return new Response(JSON.stringify({ error: { message: "User Not Authenticated" } }), { status });
    const table = u.pathname.split("/").pop();
    let rows = tables[table] || [];
    const kbs = /kb_knowledge_baseIN([^^]+)/.exec(u.searchParams.get("sysparm_query") || "")?.[1]?.split(",");
    if (kbs) rows = rows.filter((r) => kbs.includes(r.kb_knowledge_base));
    const since = /sys_updated_on>=([^^]+)/.exec(u.searchParams.get("sysparm_query") || "")?.[1];
    if (since) rows = rows.filter((r) => r.sys_updated_on >= since);
    const offset = Number(u.searchParams.get("sysparm_offset") || 0);
    const limit = Number(u.searchParams.get("sysparm_limit") || 10_000);
    return new Response(JSON.stringify({ result: rows.slice(offset, offset + limit) }), { status: 200 });
  };
  return { fetchImpl, requests };
}

const article = (n, extra = {}) => ({
  sys_id: `sys${n}`,
  number: `KB00100${n}`,
  short_description: `Article ${n}`,
  text: `<p>Article ${n} body: a project can hold <b>200</b> documents &amp; more text to pass the minimum length.</p>`,
  kb_knowledge_base: "kb-mtd",
  workflow_state: "published",
  sys_updated_on: `2026-10-2${n} 10:00:00`,
  ...extra,
});

test("instance URL: only https ServiceNow hosts, normalized to the origin", () => {
  assert.equal(normalizeInstanceUrl("dev1.service-now.com"), INSTANCE);
  assert.equal(normalizeInstanceUrl("https://DEV1.service-now.com/now/nav/ui/home"), INSTANCE);
  assert.equal(normalizeInstanceUrl("https://nypa.servicenowservices.com"), "https://nypa.servicenowservices.com");
  for (const bad of ["http://dev1.service-now.com", "https://evil.com", "https://dev1.service-now.com.evil.com", "https://dev1.service-now.com:8443", "https://a@dev1.service-now.com", "", null]) {
    assert.equal(normalizeInstanceUrl(bad), null, String(bad));
  }
});

test("connect form: basic and OAuth; secrets kept apart from what's stored in scopeConfig", () => {
  const basic = validateConnectBody({ instanceUrl: "dev1.service-now.com", username: " kms.integration ", password: "pw" });
  assert.deepEqual(basic.scope, { instanceUrl: INSTANCE, authType: "basic", username: "kms.integration" });
  assert.deepEqual(basic.secret, { password: "pw" });
  const oauth = validateConnectBody({ instanceUrl: INSTANCE, authType: "oauth", clientId: "cid", clientSecret: "cs" });
  assert.deepEqual(oauth.scope, { instanceUrl: INSTANCE, authType: "oauth", clientId: "cid" });
  assert.deepEqual(oauth.connection.auth, { type: "oauth", clientId: "cid", clientSecret: "cs" });
  assert.ok(validateConnectBody({ instanceUrl: "https://evil.com", username: "u", password: "p" }).error);
  assert.ok(validateConnectBody({ instanceUrl: INSTANCE, username: "u" }).error);
});

test("knowledge-base mapping keeps cursors, resets one whose department changed, drops unpicked", () => {
  const current = [
    { kbId: "a", title: "A", departmentId: "eng", cursor: "2026-10-01 00:00:00" },
    { kbId: "b", title: "B", departmentId: "eng", cursor: "2026-10-02 00:00:00" },
    { kbId: "c", title: "C", departmentId: "fin", cursor: "2026-10-03 00:00:00" },
  ];
  const next = mergeKnowledgeBases(current, [
    { kbId: "a", departmentId: "eng" },
    { kbId: "b", departmentId: "fin" },
    { kbId: "d", title: "D", departmentId: "eng" },
  ]);
  assert.deepEqual(next, [
    { kbId: "a", title: "A", departmentId: "eng", cursor: "2026-10-01 00:00:00" },
    { kbId: "b", title: "B", departmentId: "fin", cursor: null },
    { kbId: "d", title: "D", departmentId: "eng", cursor: null },
  ]);
});

test("Table API: read-only GETs with basic auth; knowledge bases and paged articles", async () => {
  const many = Array.from({ length: 130 }, (_, i) => article(1, { sys_id: `s${i}` }));
  const { fetchImpl, requests } = fakeTableApi({
    kb_knowledge_base: [{ sys_id: "kb-mtd", title: "MTD Product Support", description: "" }],
    kb_knowledge: many,
  });
  const conn = { instanceUrl: INSTANCE, auth: BASIC };
  assert.deepEqual(await listKnowledgeBases(conn, { fetchImpl }), [{ id: "kb-mtd", title: "MTD Product Support", description: "" }]);
  const rows = await listArticles(conn, { kbIds: ["kb-mtd"], since: "2026-10-20 00:00:00" }, { fetchImpl });
  assert.equal(rows.length, 130);
  const articleRequests = requests.filter((r) => r.url.pathname.endsWith("/kb_knowledge"));
  assert.deepEqual(articleRequests.map((r) => r.url.searchParams.get("sysparm_offset")), ["0", "100"]);
  assert.equal(
    articleRequests[0].url.searchParams.get("sysparm_query"),
    "kb_knowledge_baseINkb-mtd^sys_updated_on>=2026-10-20 00:00:00^ORDERBYsys_updated_on^ORDERBYsys_id"
  );
  for (const r of requests) {
    assert.ok(r.url.pathname.startsWith("/api/now/table/"));
    assert.equal(r.headers.Authorization, `Basic ${Buffer.from("kms.integration:pw").toString("base64")}`);
  }
});

test("Table API errors carry the status and a hint", async () => {
  const { fetchImpl } = fakeTableApi({}, { status: 401 });
  await assert.rejects(listKnowledgeBases({ instanceUrl: INSTANCE, auth: BASIC }, { fetchImpl }), (err) => err.status === 401 && /user name and password/.test(err.message));
});

test("connector: changes carry text, link and retired flag; cursor is the newest sys_updated_on", async () => {
  const { fetchImpl } = fakeTableApi({
    kb_knowledge: [article(1), article(2, { workflow_state: "retired" }), article(3, { kb_knowledge_base: "kb-it" })],
  });
  const connector = new ServiceNowConnector({ instanceUrl: INSTANCE, auth: BASIC, kbId: "kb-mtd", fetchImpl });
  const { changes, cursor } = await connector.listChanges(null);
  assert.equal(cursor, "2026-10-22 10:00:00");
  assert.deepEqual(changes.map((c) => [c.externalId, c.deleted]), [["sys1", false], ["sys2", true]]);
  assert.equal(changes[0].webUrl, `${INSTANCE}/kb_view.do?sysparm_article=KB001001`);
  assert.equal(changes[0].modifiedAt, "2026-10-21T10:00:00.000Z");
  assert.match(changes[0].content, /^KB001001: Article 1\n\nArticle 1 body: a project can hold 200 documents & more/);
  assert.equal((await connector.listChanges("2026-10-30 00:00:00")).cursor, "2026-10-30 00:00:00", "no changes keeps the cursor");
});

test("articleText and timestamps", () => {
  assert.equal(articleText({ number: "KB1", short_description: "", text: "" }), "KB1");
  assert.equal(parseServiceNowTime("2026-10-27 14:03:11").toISOString(), "2026-10-27T14:03:11.000Z");
});

test("servicenow.sync job is registered", () => {
  assert.equal(JOB_DEFINITIONS["servicenow.sync"].defaultIntervalMinutes, 60);
});

test("sync: articles land in the mapped department as drafts; access follows the department; retire, remap, retry", { skip: !RUN_DB_TESTS }, async () => {
  const prisma = new PrismaClient();
  const tag = `${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
  try {
    await prisma.$transaction(async (db) => {
      const org = await db.organization.create({ data: { name: `a17-${tag}` } });
      const plan = await db.plan.findFirst({ select: { id: true } });
      await db.subscription.create({
        data: { orgId: org.id, planId: plan.id, status: "active", stripeCustomerId: `cus_${tag}`, stripeSubscriptionId: `sub_${tag}` },
      });
      const eng = await db.department.create({ data: { orgId: org.id, name: `Eng ${tag}` } });
      const fin = await db.department.create({ data: { orgId: org.id, name: `Fin ${tag}` } });
      const member = async (name, dept) => {
        const u = await db.user.create({ data: { email: `${name}-${tag}@contoso.test`, emailVerified: true } });
        await db.organizationMember.create({ data: { orgId: org.id, userId: u.id, role: dept ? "employee" : "super_admin" } });
        if (dept) await db.departmentMember.create({ data: { departmentId: dept.id, userId: u.id, role: "member" } });
        return u;
      };
      const admin = await member("admin", null);
      const engUser = await member("eng", eng);
      const finUser = await member("fin", fin);

      const integration = await db.orgIntegration.create({
        data: {
          orgId: org.id,
          provider: "servicenow",
          scopeConfig: {
            instanceUrl: INSTANCE,
            authType: "basic",
            username: "kms.integration",
            connectedByUserId: admin.id,
            knowledgeBases: [
              { kbId: "kb-mtd", title: "MTD", departmentId: eng.id, cursor: null },
              { kbId: "kb-broken", title: "Broken", departmentId: fin.id, cursor: null },
            ],
          },
          accessToken: "unused-with-connectorFor",
          tokenExpiry: new Date(),
        },
      });

      const source = { "kb-mtd": [article(1), article(2)] };
      const connectorFor = (kb) => ({
        listChanges: async (cursor) => {
          if (kb.kbId === "kb-broken") throw new Error("403 Forbidden");
          const { fetchImpl } = fakeTableApi({ kb_knowledge: source["kb-mtd"] });
          return new ServiceNowConnector({ instanceUrl: INSTANCE, auth: BASIC, kbId: kb.kbId, fetchImpl }).listChanges(cursor);
        },
      });
      const queued = [];
      const enqueueChunk = async ({ doc }) => queued.push(doc.id);
      const run = async () => {
        const current = await db.orgIntegration.findUnique({ where: { id: integration.id } });
        return syncServiceNow(db, { integration: current, enqueueChunk, connectorFor });
      };
      const docs = () => db.document.findMany({ where: { orgId: org.id, sourceProvider: "servicenow" }, orderBy: { externalId: "asc" } });

      // First sync: two drafts in Engineering, no file, no ACL rows; the broken KB counts as a failure.
      assert.deepEqual(await run(), { found: 2, failed: 1, retired: 0 });
      let [d1, d2] = await docs();
      assert.deepEqual([d1.contentType, d1.lifecycle, d1.departmentId, d1.filePath, d1.aclSyncedAt], ["article", "draft", eng.id, null, null]);
      assert.equal(d1.externalUrl, `${INSTANCE}/kb_view.do?sysparm_article=KB001001`);
      assert.equal(d1.filename, "Article 1");
      assert.equal(queued.length, 2);
      const kbs = (await db.orgIntegration.findUnique({ where: { id: integration.id } })).scopeConfig.knowledgeBases;
      assert.equal(kbs.find((k) => k.kbId === "kb-mtd").cursor, "2026-10-22 10:00:00");
      assert.equal(kbs.find((k) => k.kbId === "kb-broken").cursor, null);

      // Approved in Needs Review → visible to Engineering only, on every path.
      await db.document.updateMany({ where: { orgId: org.id }, data: { lifecycle: "published" } });
      [d1] = await docs();
      assert.equal(await canAccessDocument(d1, { userId: engUser.id, db }), true);
      assert.equal(await canAccessDocument(d1, { userId: finUser.id, db }), false);
      for (const [u, expected] of [[engUser, 2], [finUser, 0]]) {
        const principals = await getUserPrincipals(db, u.id, { orgId: org.id });
        const seen = await db.document.count({ where: { orgId: org.id, ...searchAccessWhere({ userId: u.id, orgId: org.id, principals }) } });
        assert.equal(seen, expected);
      }

      // Re-run with nothing new: the boundary article is listed again but skipped.
      assert.deepEqual(await run(), { found: 0, failed: 1, retired: 0 });

      // Article 2 retired in ServiceNow → retired in KMS (out of search); article 1 edited → re-queued, stays published.
      source["kb-mtd"] = [
        article(1, { sys_updated_on: "2026-10-25 09:00:00", text: "<p>Updated: a project can hold 250 documents, with enough text here.</p>" }),
        article(2, { workflow_state: "retired", sys_updated_on: "2026-10-25 09:30:00" }),
      ];
      assert.deepEqual(await run(), { found: 1, failed: 1, retired: 1 });
      [d1, d2] = await docs();
      assert.equal(d2.lifecycle, "retired");
      assert.equal(d1.lifecycle, "published");
      assert.match(d1.content, /250 documents/);

      // Knowledge base remapped to Finance (cursor reset) → existing documents move.
      await db.orgIntegration.update({
        where: { id: integration.id },
        data: {
          scopeConfig: {
            ...(await db.orgIntegration.findUnique({ where: { id: integration.id } })).scopeConfig,
            knowledgeBases: mergeKnowledgeBases(kbs, [{ kbId: "kb-mtd", departmentId: fin.id }]),
          },
        },
      });
      assert.deepEqual(await run(), { found: 0, failed: 0, retired: 0 });
      [d1] = await docs();
      assert.equal(d1.departmentId, fin.id);
      assert.equal(await canAccessDocument(d1, { userId: finUser.id, db }), true);
      assert.equal(await canAccessDocument(d1, { userId: engUser.id, db }), false);
      throw ROLLBACK;
    }, { timeout: 60_000, maxWait: 20_000 });
  } catch (err) {
    if (err !== ROLLBACK) throw err;
  } finally {
    await prisma.$disconnect();
  }
});
