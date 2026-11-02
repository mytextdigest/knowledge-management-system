// Pure workflow rules, independent of database and HTTP.
export const ACTIONS = Object.freeze(['approve', 'reject', 'request_changes']);
export function validateDefinition(value) {
  if (!value || typeof value.name !== 'string' || !value.name.trim() || value.name.length > 120) return 'Invalid workflow name';
  if (!Array.isArray(value.stages) || !value.stages.length || value.stages.length > 12) return 'Workflow requires 1–12 stages';
  if (value.stages.some(s => !s || typeof s.name !== 'string' || !s.name.trim() || s.name.length > 120)) return 'Invalid workflow stage';
  for (const s of value.stages) {
    const type = s.approverType ?? 'user';
    if (!APPROVER_TYPES.includes(type)) return 'Invalid approver type';
    if (type === 'user' && (typeof s.approverUserId !== 'string' || !s.approverUserId.trim())) return 'Invalid workflow stage';
    if (type !== 'user' && s.approverUserId) return 'Only a named-person stage takes approverUserId';
    if (s.approvalMode != null && !APPROVAL_MODES.includes(s.approvalMode)) return 'Invalid approval mode';
  }
  const scope = validateScope(value);
  if (scope) return scope;
  return null;
}

// E22.2: who acts on a stage. dept_admin/steward can resolve to several
// people: "any" = the first decision settles the stage, "all" = every one of
// them must approve (any rejection or request for changes ends it).
export const APPROVER_TYPES = Object.freeze(['user', 'dept_admin', 'owner', 'steward']);
export const APPROVAL_MODES = Object.freeze(['any', 'all']);

// E22.3: departmentIds/categories, empty = all. Department ids are checked
// against the organization by the route.
export function validateScope(value) {
  for (const key of ['departmentIds', 'categories']) {
    const list = value[key];
    if (list == null) continue;
    if (!Array.isArray(list) || list.length > 100 || list.some(v => typeof v !== 'string' || !v.trim() || v.length > 120)) return `Invalid ${key}`;
  }
  return null;
}

/** Does a definition cover this document? Empty department/category lists cover everything. */
export function definitionCovers(definition, { departmentId, category }) {
  const depts = definition.departmentIds || [];
  const cats = definition.categories || [];
  return (!depts.length || depts.includes(departmentId)) && (!cats.length || cats.includes(category));
}

/** Department + category scoped beats department-only beats category-only beats org-wide. */
export function specificity(definition) {
  return ((definition.departmentIds || []).length ? 2 : 0) + ((definition.categories || []).length ? 1 : 0);
}

/**
 * After one person decides on a multi-approver stage: wait for the others
 * (approve under "all" with others still pending), or settle the stage and
 * cancel the others' tasks.
 */
export function settleStage({ mode, action, otherPending }) {
  if (action === 'approve' && mode === 'all' && otherPending > 0) return { waiting: true, cancelOthers: false };
  return { waiting: false, cancelOthers: otherPending > 0 };
}
export function decide({ actorId, submittedById, assigneeId, status, taskStatus, action, position, totalStages }) {
  if (!ACTIONS.includes(action)) return { error: 'Invalid action' };
  if (status !== 'in_review' || taskStatus !== 'pending') return { error: 'Task is not pending' };
  if (actorId !== assigneeId) return { error: 'Not assigned to actor' };
  if (actorId === submittedById) return { error: 'Self-approval is forbidden' };
  if (!Number.isInteger(position) || position < 1 || !Number.isInteger(totalStages) || position > totalStages) return { error: 'Invalid stage' };
  if (action === 'reject') return { taskStatus: 'rejected', instanceStatus: 'rejected', nextPosition: position };
  if (action === 'request_changes') return { taskStatus: 'changes_requested', instanceStatus: 'changes_requested', nextPosition: position };
  return { taskStatus: 'approved', instanceStatus: position === totalStages ? 'approved' : 'in_review', nextPosition: position === totalStages ? position : position + 1 };
}

export function validateDecommissionTarget(current, target) {
  return (current === "published" && ["archived", "retired"].includes(target)) || (current === "archived" && target === "retired");
}
export function requiresDecommissionApproval(kind, target) {
  return kind === "decommission" && ["archived", "retired"].includes(target);
}
