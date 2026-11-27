import { prisma } from "@/lib/prisma";
import { canManageDepartment } from "@/lib/orgGuard";
import { canAccessDocument } from "@/lib/access/documentAccess";

// Read access to a decision is read access to its source document under the
// search policy (F1, src/lib/access/documentAccess.js), the same rule
// decisionIntelligence.js's decisionAccessSql applies in SQL.
export async function canAccessDecisionDocument({ document, userId, isSuperAdmin }) {
  return canAccessDocument(document, { userId, isSuperAdmin });
}

// Open Question 2 (REQUIREMENTS_DECISION_INTELLIGENCE_REPOSITORY.md), resolved:
// the source document's owner, or a department admin who can manage that
// document's (or its project's) department. Deliberately not "whoever
// authored the referencing Lesson" — a decision's outcome can be worth
// recording before any lesson references it, and Lesson authorship carries
// no standing over a Decision it merely points at. Same reviewer shape as
// lessonAccess.js's canManageLesson, substituting "document owner" for
// "project owner" since a Decision has no author of its own — it's
// extracted, not written.
export async function canManageDecision({ document, userId, role }) {
  if (document.userId === userId) return true;

  let departmentId = document.departmentId || null;
  if (!departmentId && document.projectId) {
    const project = await prisma.project.findUnique({
      where: { id: document.projectId },
      select: { departmentId: true },
    });
    departmentId = project?.departmentId || null;
  }
  if (!departmentId) return role === "super_admin";
  return canManageDepartment(role, departmentId, userId);
}

// Decision Extraction v2 (REQUIREMENTS_DECISION_EXTRACTION_V2_HITL.md,
// Decisions 2 and 5): the sole authorization gate for every Decision.status
// write — confirm, reject, and outcome changes to reversed/superseded alike.
// Deliberately narrower than canManageDecision above: a document's
// owner/uploader is never sufficient on their own, only super_admin or a
// dept_admin who is an actual admin member of the document's (or its
// project's) department. canManageDecision is kept for any other future use
// but is no longer called from the decision status write path.
export async function canReviewDecision({ document, userId, role }) {
  if (role === "super_admin") return true;
  if (role !== "dept_admin") return false;

  let departmentId = document.departmentId || null;
  if (!departmentId && document.projectId) {
    const project = await prisma.project.findUnique({
      where: { id: document.projectId },
      select: { departmentId: true },
    });
    departmentId = project?.departmentId || null;
  }
  if (!departmentId) return false;
  return canManageDepartment(role, departmentId, userId);
}
