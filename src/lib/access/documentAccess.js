// F1: central document access (WS_A_M365_CONNECTORS.md §3.2).
//
// Every "can this user see this document?" rule lives here, so the
// per-file SharePoint ACL clause (A-10) and Workstream B's lifecycle filters
// (in_review, deletedAt, supersededById) are added in one place instead of
// eight. A-2 is a pure move: each function below reproduces, exactly, the
// rule it replaced, which scripts/ekp/f1-access-parity.test.mjs verifies
// against verbatim copies of the old code.
//
// Two policies exist today and are kept distinct on purpose:
//
//   Retrieval (search, chat, knowledge graph, related documents, decisions):
//     published repository documents in no department or a department the
//     user belongs to, plus documents of org-scope projects whose department
//     the user belongs to. super_admin skips the membership checks but, for
//     search, still only sees published repository documents.
//
//   Browse (repository listing, document page, timelines):
//     super_admin sees everything. Everyone else sees non-draft documents in
//     no department or a department they belong to; a dept_admin also sees
//     drafts in the departments they administer (DepartmentMember.role
//     "admin"), never in other departments.
//
// Other differences between the old copies are listed in WS_A §7 (A-2 note)
// and preserved here.

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isSuperAdmin } from "@/lib/orgGuard";

// --- SQL --------------------------------------------------------------------

function departmentMemberSql(departmentIdColumn, userId) {
  return Prisma.sql`EXISTS (
    SELECT 1 FROM "DepartmentMember" acc_dm
    WHERE acc_dm."departmentId" = ${departmentIdColumn} AND acc_dm."userId" = ${userId}
  )`;
}

/**
 * The SQL predicate for document visibility. Prefer the two presets below.
 *
 * - orgId: when set, org-scope projects must belong to this org.
 * - includeOwn: the uploader always sees their own documents.
 * - superAdminSeesAll: super_admin sees every document (drafts, private,
 *   any scope), not just published repository and org-project documents.
 */
export function documentAccessSql({
  userId,
  orgId = null,
  isSuperAdmin = false,
  alias = "d",
  includeOwn = false,
  superAdminSeesAll = false,
}) {
  const t = Prisma.raw(`"${alias}"`);
  const projectOrgFilter = orgId ? Prisma.sql`AND acc_p."orgId" = ${orgId}` : Prisma.empty;
  const superAdminAll = superAdminSeesAll ? Prisma.sql`${isSuperAdmin} OR` : Prisma.empty;
  const own = includeOwn ? Prisma.sql`OR ${t}."userId" = ${userId}` : Prisma.empty;

  return Prisma.sql`(
    ${t}."deletedAt" IS NULL AND (
    ${superAdminAll}
    (${t}.scope = 'repository'
     AND ${t}.lifecycle = 'published'
     AND (${isSuperAdmin} OR ${t}."departmentId" IS NULL OR ${departmentMemberSql(Prisma.sql`${t}."departmentId"`, userId)}))
    OR EXISTS (
      SELECT 1 FROM "Project" acc_p
      WHERE acc_p.id = ${t}."projectId"
        AND acc_p.scope = 'org'
        ${projectOrgFilter}
        AND (${isSuperAdmin} OR ${departmentMemberSql(Prisma.sql`acc_p."departmentId"`, userId)})
    )
    ${own}
    )
  )`;
}

// Search, chat retrieval and decision evidence/browse.
export function searchAccessSql({ userId, orgId, isSuperAdmin = false, alias = "d" }) {
  return documentAccessSql({ userId, orgId, isSuperAdmin, alias });
}

// Knowledge graph, related documents, relationships and conflicts.
export function knowledgeAccessSql({ userId, isSuperAdmin = false, alias = "d" }) {
  return documentAccessSql({ userId, isSuperAdmin, alias, includeOwn: true, superAdminSeesAll: true });
}

// Prisma `where` equivalent of searchAccessSql, for routes that load
// documents with the Prisma client (e.g. the chat workflow document).
export function searchAccessWhere({ userId, orgId, isSuperAdmin = false }) {
  const member = isSuperAdmin ? {} : { department: { members: { some: { userId } } } };
  return {
    OR: [
      {
        scope: "repository",
        lifecycle: "published",
        ...(isSuperAdmin ? {} : { OR: [{ departmentId: null }, member] }),
      },
      { project: { scope: "org", orgId, ...member } },
    ],
  };
}

// Prisma `where` for the org repository listing (browse policy). userDeptIds
// are the user's departments; adminDeptIds the ones they administer.
export function repositoryAccessWhere({ orgId, role, userDeptIds, adminDeptIds = [] }) {
  if (isSuperAdmin(role)) {
    return { deletedAt: null, OR: [{ scope: "repository", orgId }, { project: { scope: "org", orgId } }] };
  }
  const draftAllowed = role === "dept_admin" && adminDeptIds.length
    ? [
        { departmentId: { in: adminDeptIds } },
        { departmentId: null, project: { departmentId: { in: adminDeptIds } } },
      ]
    : [];
  return {
    AND: [
      {
        OR: [
          { scope: "repository", orgId, OR: [{ departmentId: null }, { departmentId: { in: userDeptIds } }] },
          { project: { scope: "org", orgId, departmentId: { in: userDeptIds } } },
        ],
      },
      { OR: [{ lifecycle: { not: "draft" } }, ...draftAllowed] },
    ],
  };
}

// --- JS checks ----------------------------------------------------------------

async function isDepartmentMember(db, departmentId, userId) {
  const membership = await db.departmentMember.findUnique({
    where: { departmentId_userId: { departmentId, userId } },
    select: { id: true },
  });
  return Boolean(membership);
}

async function isDepartmentAdmin(db, departmentId, userId) {
  const membership = await db.departmentMember.findUnique({
    where: { departmentId_userId: { departmentId, userId } },
    select: { role: true },
  });
  return membership?.role === "admin";
}

// The department that governs a document: its own, else its project's.
function effectiveDepartmentId(document) {
  return document.departmentId ?? document.project?.departmentId ?? null;
}

// Department ids a user administers, for repositoryAccessWhere.
export async function getAdminDepartmentIds(userId, { db = prisma } = {}) {
  const rows = await db.departmentMember.findMany({
    where: { userId, role: "admin" },
    select: { departmentId: true },
  });
  return rows.map((r) => r.departmentId);
}

/**
 * Who may manage a document (correct its classification, review duplicate
 * signals): the uploader, super_admin, or a dept_admin who administers the
 * document's department. A dept_admin never manages other departments'
 * documents, nor documents with no department. `document` needs userId,
 * departmentId and `project.departmentId`.
 */
export async function canManageDocument(document, { userId, role, db = prisma }) {
  if (document.userId === userId || isSuperAdmin(role)) return true;
  if (role !== "dept_admin") return false;
  const departmentId = effectiveDepartmentId(document);
  if (!departmentId) return false;
  return isDepartmentAdmin(db, departmentId, userId);
}

/**
 * Retrieval policy for one document already loaded with Prisma (decision
 * detail and review). `document` needs scope, lifecycle, departmentId and
 * projectId.
 */
export async function canAccessDocument(document, { userId, isSuperAdmin = false, db = prisma }) {
  if (isSuperAdmin) return true;

  if (document.scope === "repository" && document.lifecycle === "published") {
    if (!document.departmentId) return true;
    return isDepartmentMember(db, document.departmentId, userId);
  }

  if (document.projectId) {
    const project = await db.project.findUnique({
      where: { id: document.projectId },
      select: { scope: true, departmentId: true },
    });
    if (project?.scope === "org" && project.departmentId) {
      return isDepartmentMember(db, project.departmentId, userId);
    }
  }

  return false;
}

/**
 * Who may record an interaction (view/download/study time) on a document.
 * Retrieval policy plus the uploader and the project owner. `document` needs
 * userId, scope, lifecycle, departmentId and `project` (userId, scope,
 * departmentId) or null.
 */
export async function canInteractWithDocument(document, { userId, isSuperAdmin = false, db = prisma }) {
  if (document.userId === userId || isSuperAdmin) return true;
  if (document.scope === "repository" && document.lifecycle === "published") {
    if (!document.departmentId || (await isDepartmentMember(db, document.departmentId, userId))) return true;
  }
  if (document.project) {
    if (document.project.userId === userId) return true;
    if (document.project.scope === "org") {
      if (!document.project.departmentId) return true;
      return isDepartmentMember(db, document.project.departmentId, userId);
    }
  }
  return false;
}

/**
 * Browse policy for the document page. The caller has already resolved the
 * user's role in the document's org; the uploader is checked before this.
 * `document` needs lifecycle, departmentId and `project.departmentId`.
 */
export async function canViewDocument(document, { userId, role, db = prisma }) {
  if (isSuperAdmin(role)) return true;
  const departmentId = effectiveDepartmentId(document);
  if (document.lifecycle === "draft") {
    return role === "dept_admin" && Boolean(departmentId) && isDepartmentAdmin(db, departmentId, userId);
  }
  if (!departmentId) return true;
  return isDepartmentMember(db, departmentId, userId);
}

/**
 * Browse policy, batched, for endpoints that aggregate many documents (e.g. a
 * project or department timeline), so membership needs only one query.
 * Uses the document's own departmentId only (not its project's).
 */
export async function filterAccessibleDocuments(documents, { userId, role, db = prisma }) {
  if (isSuperAdmin(role)) return documents;

  const deptIds = [
    ...new Set(
      documents
        .filter((d) => d.userId !== userId && d.departmentId)
        .map((d) => d.departmentId)
    ),
  ];

  const memberships = deptIds.length
    ? await db.departmentMember.findMany({
        where: { departmentId: { in: deptIds }, userId },
        select: { departmentId: true, role: true },
      })
    : [];
  const memberDeptIds = new Set(memberships.map((m) => m.departmentId));
  const adminDeptIds = new Set(
    role === "dept_admin" ? memberships.filter((m) => m.role === "admin").map((m) => m.departmentId) : []
  );

  return documents.filter((d) => {
    if (d.userId === userId) return true;
    if (d.lifecycle === "draft") return adminDeptIds.has(d.departmentId);
    if (!d.departmentId) return true;
    return memberDeptIds.has(d.departmentId);
  });
}
