// A-2 / F1 parity test (WS_A_M365_CONNECTORS.md §3.2): the central access
// module must return exactly what the copies it replaced returned.
//
// The LEGACY_* functions below are verbatim copies of the pre-refactor code
// (git 7a87edf). Do not "fix" them; they are the reference.
//
// One intended change since A-2: the dept_admin fix (A-2 follow-up, WS_A §7).
// For dept_admin the browse functions are checked against EXPECTED_* (the new
// rule written independently below); every other role must still match legacy.
//
// SQL and Prisma-where predicates run against the database inside a
// transaction that is always rolled back, over a seeded matrix of
// scope × lifecycle × department × project × uploader, for every role.
// The JS checks run against an in-memory copy of the same seed.
//
// Run: EKP_DB_TESTS=1 npm run ekp:f1:test   (needs DATABASE_URL in .env)
import test from "node:test";
import assert from "node:assert/strict";
import { Prisma, PrismaClient } from "@prisma/client";
import {
  searchAccessSql,
  knowledgeAccessSql,
  searchAccessWhere,
  repositoryAccessWhere,
  canAccessDocument,
  canInteractWithDocument,
  canViewDocument,
  canManageDocument,
  filterAccessibleDocuments,
} from "../../src/lib/access/documentAccess.js";
import { isOrgAdmin } from "../../src/lib/orgGuard.js";

const RUN_DB_TESTS = process.env.EKP_DB_TESTS === "1";

// --- Legacy reference copies ----------------------------------------------------

// src/lib/vectorSearch.js orgSearch/orgKeywordSearch/orgFallbackTextSearch and
// decisionIntelligence.js decisionAccessSql (needs the `dm` LEFT JOIN).
function LEGACY_searchSql({ userId, orgId, isSuperAdmin }) {
  return Prisma.sql`(
        (d.scope = 'repository'
         AND d.lifecycle = 'published'
         AND (${isSuperAdmin} OR d."departmentId" IS NULL OR dm."userId" IS NOT NULL))
        OR
        EXISTS (
          SELECT 1 FROM "Project" p
          WHERE p.id = d."projectId"
            AND p.scope = 'org'
            AND p."orgId" = ${orgId}
            AND (
              ${isSuperAdmin}
              OR EXISTS (
                SELECT 1 FROM "DepartmentMember" pm
                WHERE pm."departmentId" = p."departmentId" AND pm."userId" = ${userId}
              )
            )
        )
      )`;
}

// src/lib/knowledgeContext.js accessSql
function LEGACY_knowledgeSql({ userId, isSuperAdmin = false, alias = "d" }) {
  const table = Prisma.raw(`"${alias}"`);
  return Prisma.sql`(
    ${isSuperAdmin}
    OR (${table}.scope = 'repository' AND ${table}.lifecycle = 'published' AND (
      ${table}."departmentId" IS NULL OR EXISTS (
        SELECT 1 FROM "DepartmentMember" dm
        WHERE dm."departmentId" = ${table}."departmentId" AND dm."userId" = ${userId}
      )
    ))
    OR EXISTS (
      SELECT 1 FROM "Project" p
      WHERE p.id = ${table}."projectId" AND p.scope = 'org' AND (
        ${isSuperAdmin} OR EXISTS (
          SELECT 1 FROM "DepartmentMember" pm
          WHERE pm."departmentId" = p."departmentId" AND pm."userId" = ${userId}
        )
      )
    )
    OR ${table}."userId" = ${userId}
  )`;
}

// src/app/api/org/[orgId]/chat/route.js workflow document
function LEGACY_chatWhere({ userId, orgId, superAdmin }) {
  return {
    OR: [
      {
        scope: "repository",
        lifecycle: "published",
        ...(superAdmin
          ? {}
          : { OR: [{ departmentId: null }, { department: { members: { some: { userId } } } }] }),
      },
      {
        project: {
          scope: "org",
          orgId,
          ...(superAdmin ? {} : { department: { members: { some: { userId } } } }),
        },
      },
    ],
  };
}

// src/app/api/org/[orgId]/repository/route.js
function LEGACY_repositoryWhere({ orgId, role, userDeptIds }) {
  const sourceA = isOrgAdmin(role)
    ? { scope: "repository", orgId }
    : { scope: "repository", orgId, OR: [{ departmentId: null }, { departmentId: { in: userDeptIds } }] };
  const sourceB = isOrgAdmin(role)
    ? { project: { scope: "org", orgId } }
    : { project: { scope: "org", orgId, departmentId: { in: userDeptIds } } };
  return { OR: [sourceA, sourceB] };
}

// src/lib/decisionAccess.js canAccessDecisionDocument (prisma → db)
async function LEGACY_canAccessDecisionDocument(db, { document, userId, isSuperAdmin }) {
  if (isSuperAdmin) return true;
  if (document.scope === "repository" && document.lifecycle === "published") {
    if (!document.departmentId) return true;
    const member = await db.departmentMember.findUnique({
      where: { departmentId_userId: { departmentId: document.departmentId, userId } },
    });
    return Boolean(member);
  }
  if (document.projectId) {
    const project = await db.project.findUnique({
      where: { id: document.projectId },
      select: { scope: true, departmentId: true },
    });
    if (project?.scope === "org" && project.departmentId) {
      const member = await db.departmentMember.findUnique({
        where: { departmentId_userId: { departmentId: project.departmentId, userId } },
      });
      return Boolean(member);
    }
  }
  return false;
}

// src/app/api/documents/[id]/interactions/route.js
async function LEGACY_canInteract(db, doc, userId, superAdmin) {
  async function hasDepartmentAccess(uid, departmentId) {
    if (!departmentId) return true;
    const membership = await db.departmentMember.findUnique({
      where: { departmentId_userId: { departmentId, userId: uid } },
      select: { id: true },
    });
    return Boolean(membership);
  }
  let canAccess = doc.userId === userId || superAdmin;
  if (!canAccess && doc.scope === "repository" && doc.lifecycle === "published") {
    canAccess = await hasDepartmentAccess(userId, doc.departmentId);
  }
  if (!canAccess && doc.project) {
    canAccess = doc.project.userId === userId || (
      doc.project.scope === "org" && await hasDepartmentAccess(userId, doc.project.departmentId)
    );
  }
  return canAccess;
}

// src/app/api/documents/[id]/route.js GET, the non-owner block
async function LEGACY_canViewDetail(db, doc, userId, role) {
  if (!isOrgAdmin(role)) {
    if (doc.lifecycle === "draft") return false;
    const departmentId = doc.departmentId ?? doc.project?.departmentId ?? null;
    if (departmentId) {
      const membership = await db.departmentMember.findUnique({
        where: { departmentId_userId: { departmentId, userId } },
      });
      if (!membership) return false;
    }
  }
  return true;
}

// src/lib/documentAccess.js filterAccessibleDocuments
async function LEGACY_filterAccessibleDocuments(db, documents, { userId, role }) {
  if (isOrgAdmin(role)) return documents;
  const deptIds = [...new Set(documents.filter((d) => d.userId !== userId && d.departmentId).map((d) => d.departmentId))];
  const memberships = deptIds.length
    ? await db.departmentMember.findMany({ where: { departmentId: { in: deptIds }, userId }, select: { departmentId: true } })
    : [];
  const memberDeptIds = new Set(memberships.map((m) => m.departmentId));
  return documents.filter((d) => {
    if (d.userId === userId) return true;
    if (d.lifecycle === "draft") return false;
    if (!d.departmentId) return true;
    return memberDeptIds.has(d.departmentId);
  });
}

// src/app/api/documents/[id]/classification and duplicates routes
function LEGACY_canManage(doc, userId, role) {
  return isOrgAdmin(role) || doc.userId === userId;
}

// --- Expected dept_admin behaviour (the fix) -----------------------------------

const effectiveDept = (doc) => doc.departmentId ?? doc.project?.departmentId ?? null;

function EXPECTED_deptAdmin({ doc, userId, orgId, userDepts, adminDepts }) {
  const eff = effectiveDept(doc);
  const draftOk = doc.lifecycle !== "draft" || adminDepts.has(eff);
  const inRepository =
    (doc.scope === "repository" && (doc.departmentId === null || userDepts.has(doc.departmentId))) ||
    (doc.project?.scope === "org" && doc.project.orgId === orgId && userDepts.has(doc.project.departmentId));
  return {
    repository: inRepository && draftOk,
    view: doc.lifecycle === "draft" ? adminDepts.has(eff) : eff === null || userDepts.has(eff),
    timeline:
      doc.userId === userId ||
      (doc.lifecycle === "draft" ? adminDepts.has(doc.departmentId) : doc.departmentId === null || userDepts.has(doc.departmentId)),
    manage: doc.userId === userId || adminDepts.has(eff),
  };
}

// --- Seed -------------------------------------------------------------------

const ROLLBACK = Symbol("rollback");

async function seed(tx, tag) {
  const org = await tx.organization.create({ data: { name: `f1-parity-${tag}` } });
  const otherOrg = await tx.organization.create({ data: { name: `f1-parity-other-${tag}` } });
  const [deptA, deptB] = await Promise.all(
    ["A", "B"].map((n) => tx.department.create({ data: { orgId: org.id, name: `Dept ${n} ${tag}` } }))
  );
  const deptC = await tx.department.create({ data: { orgId: otherOrg.id, name: `Dept C ${tag}` } });

  const people = [
    ["superAdmin", "super_admin", []],
    // Admin of A, plain member of B: must never see B's drafts.
    ["deptAdminA", "dept_admin", [[deptA, "admin"], [deptB, "member"]]],
    ["employeeA", "employee", [[deptA, "member"]]],
    ["employeeB", "employee", [[deptB, "member"]]],
    ["employeeNone", "employee", []],
    ["guest", "guest", []],
  ];
  const users = {};
  const memberships = [];
  for (const [key, role, depts] of people) {
    const user = await tx.user.create({ data: { email: `f1-${key}-${tag}@example.test`, name: key } });
    await tx.organizationMember.create({ data: { orgId: org.id, userId: user.id, role } });
    for (const [dept, deptRole] of depts) {
      await tx.departmentMember.create({ data: { departmentId: dept.id, userId: user.id, role: deptRole } });
      memberships.push({ departmentId: dept.id, userId: user.id, role: deptRole });
    }
    users[key] = { ...user, role };
  }

  const mkProject = (name, scope, orgId, departmentId, userId) =>
    tx.project.create({ data: { name: `${name} ${tag}`, scope, orgId, departmentId, userId } });
  const projects = {
    orgA: await mkProject("orgA", "org", org.id, deptA.id, users.employeeA.id),
    orgB: await mkProject("orgB", "org", org.id, deptB.id, users.employeeB.id),
    personalA: await mkProject("personalA", "personal", org.id, deptA.id, users.employeeA.id),
    otherOrg: await mkProject("otherOrg", "org", otherOrg.id, deptC.id, users.superAdmin.id),
  };

  const rows = [];
  for (const scope of ["repository", "project", "private"])
    for (const lifecycle of ["published", "draft", "archived"])
      for (const departmentId of [deptA.id, deptB.id, null])
        for (const project of [null, projects.orgA, projects.orgB, projects.personalA, projects.otherOrg])
          for (const uploader of [users.employeeA, users.superAdmin])
            rows.push({
              orgId: org.id, scope, lifecycle, departmentId,
              projectId: project?.id ?? null, userId: uploader.id,
              filename: `f1-${scope}-${lifecycle}-${rows.length}`,
            });
  await tx.document.createMany({ data: rows });
  const documents = await tx.document.findMany({
    where: { orgId: org.id },
    select: {
      id: true, filename: true, userId: true, scope: true, lifecycle: true, departmentId: true, projectId: true,
      // A-10: no source permissions on these, so the ACL clause never applies.
      aclSyncedAt: true,
      project: { select: { userId: true, scope: true, departmentId: true, orgId: true } },
    },
  });

  return { org, users, memberships, projects: Object.values(projects), documents };
}

// In-memory stand-in for the two Prisma calls the JS checks make.
function fakeDb({ memberships, projects }) {
  return {
    departmentMember: {
      async findUnique({ where }) {
        const { departmentId, userId } = where.departmentId_userId;
        return memberships.find((m) => m.departmentId === departmentId && m.userId === userId) ?? null;
      },
      async findMany({ where }) {
        return memberships.filter((m) =>
          m.userId === where.userId &&
          (!where.departmentId || where.departmentId.in.includes(m.departmentId)) &&
          (!where.role || m.role === where.role));
      },
    },
    project: {
      async findUnique({ where }) {
        const p = projects.find((x) => x.id === where.id);
        return p ? { scope: p.scope, departmentId: p.departmentId } : null;
      },
    },
  };
}

const ids = (rows) => rows.map((r) => r.id).sort();

async function compareSearchSql(tx, orgId, userId, isSuperAdmin) {
  const run = (predicate) => tx.$queryRaw`
    SELECT d.id FROM "Document" d
    LEFT JOIN "DepartmentMember" dm ON d."departmentId" = dm."departmentId" AND dm."userId" = ${userId}
    WHERE d."orgId" = ${orgId} AND ${predicate}`;
  const legacy = ids(await run(LEGACY_searchSql({ userId, orgId, isSuperAdmin })));
  const current = ids(await run(searchAccessSql({ userId, orgId, isSuperAdmin })));
  assert.deepEqual(current, legacy, `search SQL differs for user ${userId} (superAdmin=${isSuperAdmin})`);
  return current.length;
}

async function compareKnowledgeSql(tx, orgId, userId, isSuperAdmin) {
  const run = (predicate) => tx.$queryRaw`
    SELECT d.id FROM "Document" d WHERE d."orgId" = ${orgId} AND ${predicate}`;
  const legacy = ids(await run(LEGACY_knowledgeSql({ userId, isSuperAdmin, alias: "d" })));
  const current = ids(await run(knowledgeAccessSql({ userId, isSuperAdmin, alias: "d" })));
  assert.deepEqual(current, legacy, `knowledge SQL differs for user ${userId} (superAdmin=${isSuperAdmin})`);
  return current.length;
}

// --- Tests --------------------------------------------------------------------

test("F1 central access matches every legacy copy on a seeded matrix", { skip: !RUN_DB_TESTS }, async () => {
  const prisma = new PrismaClient();
  const tag = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const visibleCounts = new Set();
  try {
    await prisma.$transaction(async (tx) => {
      const { org, users, memberships, projects, documents } = await seed(tx, tag);
      const db = fakeDb({ memberships, projects });
      assert.equal(documents.length, 270);

      for (const user of Object.values(users)) {
        const userDeptIds = memberships.filter((m) => m.userId === user.id).map((m) => m.departmentId);

        for (const superAdmin of [false, true]) {
          visibleCounts.add(await compareSearchSql(tx, org.id, user.id, superAdmin));
          visibleCounts.add(await compareKnowledgeSql(tx, org.id, user.id, superAdmin));

          const legacyChat = await tx.document.findMany({ where: { orgId: org.id, ...LEGACY_chatWhere({ userId: user.id, orgId: org.id, superAdmin }) }, select: { id: true } });
          const chat = await tx.document.findMany({ where: { orgId: org.id, ...searchAccessWhere({ userId: user.id, orgId: org.id, isSuperAdmin: superAdmin }) }, select: { id: true } });
          assert.deepEqual(ids(chat), ids(legacyChat), `chat where differs for ${user.name}`);
          // The Prisma and SQL forms of the search policy must agree too.
          const searchRows = await tx.$queryRaw`SELECT d.id FROM "Document" d WHERE d."orgId" = ${org.id} AND ${searchAccessSql({ userId: user.id, orgId: org.id, isSuperAdmin: superAdmin })}`;
          assert.deepEqual(ids(chat), ids(searchRows), `search where vs SQL differs for ${user.name}`);

          for (const doc of documents) {
            assert.equal(
              await canAccessDocument(doc, { userId: user.id, isSuperAdmin: superAdmin, db }),
              await LEGACY_canAccessDecisionDocument(db, { document: doc, userId: user.id, isSuperAdmin: superAdmin }),
              `canAccessDocument differs for ${user.name} on ${doc.id}`
            );
            assert.equal(
              await canInteractWithDocument(doc, { userId: user.id, isSuperAdmin: superAdmin, db }),
              await LEGACY_canInteract(db, doc, user.id, superAdmin),
              `canInteractWithDocument differs for ${user.name} on ${doc.id}`
            );
          }
        }

        const adminDeptIds = memberships.filter((m) => m.userId === user.id && m.role === "admin").map((m) => m.departmentId);
        const repo = ids(await tx.document.findMany({ where: { orgId: org.id, ...repositoryAccessWhere({ orgId: org.id, role: user.role, userDeptIds, adminDeptIds }) }, select: { id: true } }));
        const timeline = ids(await filterAccessibleDocuments(documents, { userId: user.id, role: user.role, db }));
        const views = new Map();
        const manages = new Map();
        for (const doc of documents) {
          views.set(doc.id, await canViewDocument(doc, { userId: user.id, role: user.role, db }));
          manages.set(doc.id, await canManageDocument(doc, { userId: user.id, role: user.role, db }));
        }

        if (user.role === "dept_admin") {
          const userDepts = new Set(userDeptIds);
          const adminDepts = new Set(adminDeptIds);
          const expected = new Map(documents.map((doc) => [doc.id, EXPECTED_deptAdmin({ doc, userId: user.id, orgId: org.id, userDepts, adminDepts })]));
          assert.deepEqual(repo, documents.filter((d) => expected.get(d.id).repository).map((d) => d.id).sort(), "dept_admin repository listing");
          assert.deepEqual(timeline, documents.filter((d) => expected.get(d.id).timeline).map((d) => d.id).sort(), "dept_admin timelines");
          for (const doc of documents) {
            assert.equal(views.get(doc.id), expected.get(doc.id).view, `dept_admin document page on ${doc.filename}`);
            assert.equal(manages.get(doc.id), expected.get(doc.id).manage, `dept_admin manage on ${doc.filename}`);
          }
          // The bug itself: no draft from a department they don't administer.
          const deptB = memberships.find((m) => m.userId === user.id && m.role === "member").departmentId;
          const leaked = documents.filter((d) => d.lifecycle === "draft" && effectiveDept(d) === deptB && (repo.includes(d.id) || views.get(d.id)));
          assert.equal(leaked.length, 0, "dept_admin sees drafts of a department they don't administer");
          assert.ok(documents.some((d) => d.lifecycle === "draft" && views.get(d.id)), "dept_admin still sees drafts in their own department");
          continue;
        }

        // Every other role: unchanged from legacy (the repository route used to
        // add the draft filter itself for non-admins).
        const legacyRepoWhere = LEGACY_repositoryWhere({ orgId: org.id, role: user.role, userDeptIds });
        const legacyRepo = ids(await tx.document.findMany({
          where: { orgId: org.id, AND: [legacyRepoWhere, ...(isOrgAdmin(user.role) ? [] : [{ lifecycle: { not: "draft" } }])] },
          select: { id: true },
        }));
        assert.deepEqual(repo, legacyRepo, `repository where differs for ${user.name}`);
        assert.deepEqual(timeline, ids(await LEGACY_filterAccessibleDocuments(db, documents, { userId: user.id, role: user.role })), `filterAccessibleDocuments differs for ${user.name}`);
        for (const doc of documents) {
          assert.equal(views.get(doc.id), await LEGACY_canViewDetail(db, doc, user.id, user.role), `canViewDocument differs for ${user.name} on ${doc.id}`);
          assert.equal(manages.get(doc.id), LEGACY_canManage(doc, user.id, user.role), `canManageDocument differs for ${user.name} on ${doc.id}`);
        }
      }

      throw ROLLBACK;
    }, { timeout: 180_000, maxWait: 20_000 });
  } catch (err) {
    if (err !== ROLLBACK) throw err;
  } finally {
    await prisma.$disconnect();
  }
  // Guard against a vacuous pass: different users must see different sets.
  assert.ok(visibleCounts.size > 3, `expected varied visibility, got counts ${[...visibleCounts]}`);
});

test("F1 central access matches legacy SQL on existing data (read-only)", { skip: !RUN_DB_TESTS }, async () => {
  const prisma = new PrismaClient();
  try {
    const members = await prisma.organizationMember.findMany({ select: { orgId: true, userId: true, role: true } });
    for (const m of members) {
      const superAdmin = m.role === "super_admin";
      await compareSearchSql(prisma, m.orgId, m.userId, superAdmin);
      await compareKnowledgeSql(prisma, m.orgId, m.userId, superAdmin);
    }
  } finally {
    await prisma.$disconnect();
  }
});
