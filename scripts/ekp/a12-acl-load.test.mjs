// A-12 (automated part): the per-file permission check at NYPA scale.
// Seeds 5,000 SharePoint documents with realistic ACLs (site groups expanded
// to the M365 group, plus a mix of direct user, security-group and org-link
// grants) and 300 users with identities, inside a transaction that is always
// rolled back, then times the F1 predicates and checks the counts.
// Run: EKP_DB_TESTS=1 npm run ekp:a12:test
import test from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { searchAccessSql, knowledgeAccessSql, repositoryAccessWhere, getUserPrincipals } from "../../src/lib/access/documentAccess.js";
import { clearCachedGroups, setCachedGroups } from "../../src/lib/identity/groupCache.js";

const RUN_DB_TESTS = process.env.EKP_DB_TESTS === "1";
const ROLLBACK = Symbol("rollback");
const DOCS = 5000;
const USERS = 300;
// Generous: the shared dev database is remote (Neon); this catches a
// missing index or a per-row Graph-style blow-up, not milliseconds.
const BUDGET_MS = 3000;

const guid = (prefix, n) => `${prefix}${String(n).padStart(12, "0")}`.replace(/^(.{8})(.{4})(.{4})(.{4})(.{12}).*$/, "$1-$2-$3-$4-$5");

test(`ACL check over ${DOCS} SharePoint documents stays within ${BUDGET_MS} ms per query`, { skip: !RUN_DB_TESTS, timeout: 600_000 }, async () => {
  const prisma = new PrismaClient();
  const tag = `${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
  const tenantId = guid("7e7a7e7a", 1);
  const m365 = guid("6a0e0000", 1);
  const groups = Array.from({ length: 20 }, (_, i) => guid("5ec00000", i));
  try {
    await prisma.$transaction(async (db) => {
      const org = await db.organization.create({ data: { name: `a12-${tag}` } });
      const dept = await db.department.create({ data: { orgId: org.id, name: `Eng ${tag}` } });
      const uploader = await db.user.create({ data: { email: `a12-admin-${tag}@contoso.test` } });
      await db.orgIntegration.create({
        data: { orgId: org.id, provider: "sharepoint", scopeConfig: { tenantId, sites: [] }, accessToken: "x", tokenExpiry: new Date() },
      });

      // Users: everyone in the M365 group's tenant; each in 2 security groups; 10% no identity.
      const userRows = Array.from({ length: USERS }, (_, i) => ({ id: `a12u${i}-${tag}`, email: `u${i}-${tag}@contoso.test`, emailVerified: true }));
      await db.user.createMany({ data: userRows });
      await db.organizationMember.createMany({ data: userRows.map((u) => ({ orgId: org.id, userId: u.id, role: "employee" })) });
      await db.departmentMember.createMany({ data: userRows.map((u) => ({ departmentId: dept.id, userId: u.id, role: "member" })) });
      const withIdentity = userRows.slice(0, USERS * 0.9);
      await db.userIdentity.createMany({
        data: withIdentity.map((u, i) => ({ userId: u.id, provider: "entra", source: "email_match", tenantId, externalId: guid("05e40000", i) })),
      });
      withIdentity.forEach((u, i) => setCachedGroups(u.id, {
        groupIds: [groups[i % 20], groups[(i + 7) % 20], ...(i % 3 === 0 ? [m365] : [])],
        ownedGroupIds: i % 50 === 0 ? [m365] : [],
      }));

      // Documents: every one has the site-group rows; then 1 in 4 a direct user, 1 in 4 a group, 1 in 10 an org link.
      const docRows = Array.from({ length: DOCS }, (_, i) => ({
        id: `a12d${i}-${tag}`, filename: `f${i}.docx`, userId: uploader.id, orgId: org.id, departmentId: dept.id,
        scope: "repository", lifecycle: "published", sourceProvider: "sharepoint", externalId: `item-${i}-${tag}`, aclSyncedAt: new Date(),
      }));
      await db.document.createMany({ data: docRows });
      const acl = [];
      docRows.forEach((d, i) => {
        acl.push({ documentId: d.id, principalType: "group", principalId: m365 }, { documentId: d.id, principalType: "group_owners", principalId: m365 });
        if (i % 4 === 0) acl.push({ documentId: d.id, principalType: "user", principalId: guid("05e40000", i % USERS) });
        if (i % 4 === 1) acl.push({ documentId: d.id, principalType: "group", principalId: groups[i % 20] });
        if (i % 10 === 0) acl.push({ documentId: d.id, principalType: "tenant", principalId: tenantId });
      });
      for (let i = 0; i < acl.length; i += 5000) await db.documentAcl.createMany({ data: acl.slice(i, i + 5000) });

      const time = async (label, fn) => {
        const start = performance.now();
        const value = await fn();
        const ms = Math.round(performance.now() - start);
        console.log(`  ${label}: ${ms} ms`);
        assert.ok(ms < BUDGET_MS, `${label} took ${ms} ms`);
        return value;
      };

      // u4: two security groups, not in the M365 group → a subset.
      // u50: owns the M365 group (site Owners) → everything.
      // last user: no Entra identity → nothing.
      for (const [label, user, expect] of [
        ["security-group member", userRows[4], "subset"],
        ["M365 group owner", userRows[50], "all"],
        ["no identity", userRows[USERS - 1], "none"],
      ]) {
        const search = await time(`search predicate (${label})`, () => db.$queryRaw`
          SELECT count(*)::int AS n FROM "Document" d WHERE d."orgId" = ${org.id} AND ${searchAccessSql({ userId: user.id, orgId: org.id })}`);
        const graph = await time(`knowledge predicate (${label})`, () => db.$queryRaw`
          SELECT count(*)::int AS n FROM "Document" d WHERE d."orgId" = ${org.id} AND ${knowledgeAccessSql({ userId: user.id })}`);
        const principals = await getUserPrincipals(db, user.id, { orgId: org.id });
        const repo = await time(`repository where (${label})`, () =>
          db.document.count({ where: repositoryAccessWhere({ orgId: org.id, role: "employee", userDeptIds: [dept.id], principals }) }));
        assert.equal(search[0].n, graph[0].n);
        assert.equal(search[0].n, repo);
        if (expect === "none") assert.equal(search[0].n, 0, "no identity → no ACL-restricted documents");
        else if (expect === "all") assert.equal(search[0].n, DOCS);
        else assert.ok(search[0].n > 0 && search[0].n < DOCS, `${label} sees a subset (${search[0].n})`);
      }
      throw ROLLBACK;
    }, { timeout: 600_000, maxWait: 20_000 });
  } catch (err) {
    if (err !== ROLLBACK) throw err;
  } finally {
    clearCachedGroups();
    await prisma.$disconnect();
  }
});
