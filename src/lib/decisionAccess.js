import { prisma } from "@/lib/prisma";
import { canManageDepartment } from "@/lib/orgGuard";

// Mirrors the read-access rule in src/lib/decisionIntelligence.js's
// decisionAccessSql (kept as separate JS here since the detail route already
// has the document loaded via Prisma and doesn't need a second raw query): a
// decision is visible only if its source document is a published repository
// document in a department the user belongs to (or an unassigned
// department), or is attached to an org-scope project whose department the
// user belongs to. isSuperAdmin bypasses both.
export async function canAccessDecisionDocument({ document, userId, isSuperAdmin }) {
  if (isSuperAdmin) return true;

  if (document.scope === "repository" && document.lifecycle === "published") {
    if (!document.departmentId) return true;
    const member = await prisma.departmentMember.findUnique({
      where: { departmentId_userId: { departmentId: document.departmentId, userId } },
    });
    return Boolean(member);
  }

  if (document.projectId) {
    const project = await prisma.project.findUnique({
      where: { id: document.projectId },
      select: { scope: true, departmentId: true },
    });
    if (project?.scope === "org" && project.departmentId) {
      const member = await prisma.departmentMember.findUnique({
        where: { departmentId_userId: { departmentId: project.departmentId, userId } },
      });
      return Boolean(member);
    }
  }

  return false;
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
