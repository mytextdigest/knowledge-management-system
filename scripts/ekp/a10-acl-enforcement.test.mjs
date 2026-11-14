// A-10: the per-file permission clause in every F1 entry point
// (src/lib/access/documentAcl.js, documentAccess.js, expertDiscoveryQuery.mjs).
// Seeds one org with SharePoint-style documents (DocumentAcl rows) and users
// with identities, inside a transaction that is always rolled back.
// Run: EKP_DB_TESTS=1 npm run ekp:a10:test
import test from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import {
  searchAccessSql,
  knowledgeAccessSql,
  searchAccessWhere,
  repositoryAccessWhere,
  canAccessDocument,
  canInteractWithDocument,
  canViewDocument,
  filterAccessibleDocuments,
  getUserPrincipals,
} from "../../src/lib/access/documentAccess.js";
import { clearCachedGroups, setCachedGroups } from "../../src/lib/identity/groupCache.js";
import { getAccessibleExpertsWithPrisma } from "../../src/lib/expertDiscoveryQuery.mjs";

const RUN_DB_TESTS = process.env.EKP_DB_TESTS === "1";
const ROLLBACK = Symbol("rollback");

const TENANT = "11111111-1111-1111-1111-111111111111";
const OTHER_TENANT = "22222222-2222-2222-2222-222222222222";
const ENG_GROUP = "eeeeeeee-0000-0000-0000-000000000001";
const M365 = "eeeeeeee-0000-0000-0000-000000000002";

test("SharePoint permissions narrow every access path; other documents are unaffected", { skip: !RUN_DB_TESTS }, async () => {
  const prisma = new PrismaClient();
  const tag = `${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
  try {
    await prisma.$transaction(async (db) => {
      const org = await db.organization.create({ data: { name: `a10-${tag}` } });
      const dept = await db.department.create({ data: { orgId: org.id, name: `Eng ${tag}` } });
      await db.orgIntegration.create({
        data: { orgId: org.id, provider: "sharepoint", scopeConfig: { tenantId: TENANT, sites: [] }, accessToken: "x", tokenExpiry: new Date() },
      });

      const user = async (name, role, { oid, tenantId = TENANT, groups = [], owned = [] } = {}) => {
        const u = await db.user.create({ data: { email: `${name}-${tag}@contoso.test`, emailVerified: true } });
        await db.organizationMember.create({ data: { orgId: org.id, userId: u.id, role } });
        if (role !== "super_admin") await db.departmentMember.create({ data: { departmentId: dept.id, userId: u.id, role: "member" } });
        if (oid) {
          await db.userIdentity.create({ data: { userId: u.id, provider: "entra", source: "email_match", tenantId, externalId: oid } });
          setCachedGroups(u.id, { groupIds: groups, ownedGroupIds: owned });
        }
        return u;
      };
      const admin = await user("admin", "super_admin");
      const emp1 = await user("emp1", "employee", { oid: "00000000-0000-0000-0000-0000000000e1" });
      const engMember = await user("engmember", "employee", { oid: "00000000-0000-0000-0000-0000000000e2", groups: [ENG_GROUP] });
      const m365Owner = await user("owner", "employee", { oid: "00000000-0000-0000-0000-0000000000e3", owned: [M365] });
      const tenantOnly = await user("tenantonly", "employee", { oid: "00000000-0000-0000-0000-0000000000e4" });
      const otherTenant = await user("othertenant", "employee", { oid: "00000000-0000-0000-0000-0000000000e1", tenantId: OTHER_TENANT });
      const noIdentity = await user("noidentity", "employee");
      const deptAdmin = await user("deptadmin", "dept_admin");
      await db.departmentMember.update({ where: { departmentId_userId: { departmentId: dept.id, userId: deptAdmin.id } }, data: { role: "admin" } });

      const doc = (name, acl, extra = {}) => db.document.create({
        data: {
          filename: `${name}-${tag}`,
          userId: admin.id,
          orgId: org.id,
          departmentId: dept.id,
          scope: "repository",
          lifecycle: "published",
          sourceProvider: acl ? "sharepoint" : "manual",
          ...(acl ? { aclSyncedAt: new Date(), acl: { create: acl.map(([principalType, principalId]) => ({ principalType, principalId })) } } : {}),
          ...extra,
        },
      });
      const docs = {
        manual: await doc("manual", null),
        onlyEmp1: await doc("only-emp1", [["user", "00000000-0000-0000-0000-0000000000e1"], ["group_owners", M365]]),
        engGroup: await doc("eng-group", [["group", ENG_GROUP]]),
        orgLink: await doc("org-link", [["tenant", TENANT]]),
        nobody: await doc("nobody", []),
      };
      const idsOf = (rows) => new Set(rows.map((r) => r.id));
      const names = (set) => Object.entries(docs).filter(([, d]) => set.has(d.id)).map(([n]) => n).sort();

      // What each user may see, through each path.
      const expected = {
        admin: ["engGroup", "manual", "nobody", "onlyEmp1", "orgLink"],
        emp1: ["manual", "onlyEmp1", "orgLink"],
        engMember: ["engGroup", "manual", "orgLink"],
        m365Owner: ["manual", "onlyEmp1", "orgLink"],
        tenantOnly: ["manual", "orgLink"],
        otherTenant: ["manual"], // same object id, different tenant: nothing
        noIdentity: ["manual"],
        deptAdmin: ["manual"],
      };
      const users = { admin, emp1, engMember, m365Owner, tenantOnly, otherTenant, noIdentity, deptAdmin };
      const roleOf = { admin: "super_admin", deptAdmin: "dept_admin" };
      const docList = Object.values(docs).map((d) => ({ ...d, project: null }));

      for (const [key, u] of Object.entries(users)) {
        const role = roleOf[key] || "employee";
        const isSuperAdmin = role === "super_admin";
        const want = expected[key];

        const search = await db.$queryRaw`SELECT d.id FROM "Document" d WHERE d."orgId" = ${org.id} AND ${searchAccessSql({ userId: u.id, orgId: org.id, isSuperAdmin })}`;
        assert.deepEqual(names(idsOf(search)), want, `${key}: search`);

        const graph = await db.$queryRaw`SELECT d.id FROM "Document" d WHERE d."orgId" = ${org.id} AND ${knowledgeAccessSql({ userId: u.id, isSuperAdmin })}`;
        assert.deepEqual(names(idsOf(graph)), want, `${key}: knowledge graph`);

        const principals = await getUserPrincipals(db, u.id, { orgId: org.id });
        const where = await db.document.findMany({ where: { orgId: org.id, ...searchAccessWhere({ userId: u.id, orgId: org.id, isSuperAdmin, principals }) }, select: { id: true } });
        assert.deepEqual(names(idsOf(where)), want, `${key}: chat workflow (Prisma where)`);

        const repo = await db.document.findMany({
          where: repositoryAccessWhere({ orgId: org.id, role, userDeptIds: [dept.id], adminDeptIds: role === "dept_admin" ? [dept.id] : [], principals }),
          select: { id: true },
        });
        assert.deepEqual(names(idsOf(repo)), want, `${key}: repository`);
        const noPrincipals = await db.document.findMany({ where: repositoryAccessWhere({ orgId: org.id, role, userDeptIds: [dept.id] }), select: { id: true } });
        assert.deepEqual(names(idsOf(noPrincipals)), isSuperAdmin ? want : ["manual"], `${key}: repository without principals fails closed`);

        for (const [name, d] of Object.entries(docs)) {
          const should = want.includes(name);
          const loaded = { ...d, project: null };
          assert.equal(await canAccessDocument(loaded, { userId: u.id, isSuperAdmin, db }), should, `${key}: canAccessDocument ${name}`);
          assert.equal(await canViewDocument(loaded, { userId: u.id, role, db }), should, `${key}: canViewDocument ${name}`);
          assert.equal(await canInteractWithDocument(loaded, { userId: u.id, isSuperAdmin, db }), should, `${key}: canInteractWithDocument ${name}`);
        }

        const filtered = await filterAccessibleDocuments(docList, { userId: u.id, role, db });
        assert.deepEqual(names(idsOf(filtered)), want, `${key}: timelines`);
      }

      // The uploader always sees their own documents in the knowledge graph.
      const own = await doc("own-upload", [], { userId: emp1.id });
      const ownRows = await db.$queryRaw`SELECT d.id FROM "Document" d WHERE d.id = ${own.id} AND ${knowledgeAccessSql({ userId: emp1.id })}`;
      assert.equal(ownRows.length, 1);
      // Suggested experts: the expert must be allowed to see the document too,
      // not only share its department (emp1 asks about onlyEmp1's topic).
      const topic = await db.topic.create({ data: { orgId: org.id, scope: "repository", name: `Kestrel ${tag}` } });
      await db.topicDocument.create({ data: { topicId: topic.id, documentId: docs.onlyEmp1.id } });
      for (const expert of [emp1, engMember, m365Owner, noIdentity]) {
        await db.topicExpertise.create({ data: { topicId: topic.id, userId: expert.id, score: 0.5 } });
      }
      const experts = await getAccessibleExpertsWithPrisma(db, {
        orgId: org.id, userId: emp1.id, topicId: topic.id, loadGroups: async () => {}, limit: 20,
      });
      assert.deepEqual(
        experts.map((e) => e.id).sort(),
        [emp1.id, m365Owner.id].sort(),
        "only experts who can open the document (emp1 directly, the M365 group owner) are suggested"
      );

      // A cold group cache narrows access: engMember keeps only what doesn't need a group.
      clearCachedGroups(engMember.id);
      const cold = await db.$queryRaw`SELECT d.id FROM "Document" d WHERE d."orgId" = ${org.id} AND ${searchAccessSql({ userId: engMember.id, orgId: org.id })}`;
      assert.deepEqual(names(idsOf(cold)), ["manual", "orgLink"]);
      throw ROLLBACK;
    }, { timeout: 120_000, maxWait: 20_000 });
  } catch (err) {
    if (err !== ROLLBACK) throw err;
  } finally {
    clearCachedGroups();
    await prisma.$disconnect();
  }
});
