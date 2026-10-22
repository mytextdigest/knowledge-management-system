// Pure workflow rules, independent of database and HTTP.
export const ACTIONS = Object.freeze(['approve', 'reject', 'request_changes']);
export function validateDefinition(value) {
  if (!value || typeof value.name !== 'string' || !value.name.trim() || value.name.length > 120) return 'Invalid workflow name';
  if (!Array.isArray(value.stages) || !value.stages.length || value.stages.length > 12) return 'Workflow requires 1–12 stages';
  if (value.stages.some(s => !s || typeof s.name !== 'string' || !s.name.trim() || s.name.length > 120 || typeof s.approverUserId !== 'string' || !s.approverUserId.trim())) return 'Invalid workflow stage';
  return null;
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
