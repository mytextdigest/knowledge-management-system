import { canManageDepartment } from "@/lib/orgGuard";

// A lesson can be edited/deleted by its author, the project owner (if
// project-scoped), or an admin who can manage the lesson's department —
// shared by both the project- and department-scoped lesson routes so the two
// don't drift out of sync on who's allowed to touch what.
export async function canEditLesson({ lesson, userId, role, projectOwnerId = null }) {
  if (lesson.authorUserId === userId) return true;
  if (projectOwnerId && projectOwnerId === userId) return true;
  return canManageDepartment(role, lesson.departmentId, userId);
}
