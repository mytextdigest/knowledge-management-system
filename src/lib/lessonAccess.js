import { canManageDepartment } from "@/lib/orgGuard";

// The project owner (if project-scoped) or an admin who can manage the
// lesson's department. This is the "reviewer" set — the only people allowed
// to promote a lesson to published, or to touch one that already is.
// Deliberately does NOT include plain authorship: any department member
// (including an org-wide "guest") can write a lesson, but publishing it
// where it becomes chat grounding and department/org-wide visible knowledge
// requires someone with actual review authority. See
// docs/tier-2/REQUIREMENTS_LESSONS_LEARNED_INTELLIGENCE.md FR-6.
export async function canManageLesson({ lesson, userId, role, projectOwnerId = null }) {
  if (projectOwnerId && projectOwnerId === userId) return true;
  return canManageDepartment(role, lesson.departmentId, userId);
}

// A lesson can be edited/deleted by its author while it's still a draft
// (self-correction before review), or by a reviewer (canManageLesson) at any
// time. Once a lesson is published, authorship alone no longer grants edit
// rights — a reviewer already approved that content, and letting the
// original author silently rewrite it afterward would defeat the point of
// requiring review to publish in the first place.
export async function canEditLesson({ lesson, userId, role, projectOwnerId = null }) {
  if (lesson.status !== "published" && lesson.authorUserId === userId) return true;
  return canManageLesson({ lesson, userId, role, projectOwnerId });
}
