export const PROJECT_LINK_STATUSES = new Set(["confirmed", "dismissed"]);

export function normalizeProjectLinkStatus(value) {
  return PROJECT_LINK_STATUSES.has(value) ? value : null;
}

export function canManageProjectLink({ role, documentUserId, userId }) {
  return role === "super_admin" || role === "dept_admin" || documentUserId === userId;
}
