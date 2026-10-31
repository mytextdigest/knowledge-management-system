export const NOTIFICATION_TYPES = Object.freeze([
  'workflow.task_assigned', 'workflow.decided', 'review.due',
  'review.overdue', 'review.requested', 'content.stale', 'content.published', 'ownership.assigned', 'summary.pending_review',
]);
export const isNotificationType = (type) => NOTIFICATION_TYPES.includes(type);
export function validateNotificationInput({ orgId, userIds, type, title, body, link }) {
  if (typeof orgId !== 'string' || !orgId.trim()) return 'Invalid organization';
  if (!Array.isArray(userIds) || userIds.length > 100 || userIds.some(id => typeof id !== 'string' || !id.trim())) return 'Invalid recipients';
  if (!isNotificationType(type)) return 'Unknown notification type';
  if (typeof title !== 'string' || !title.trim() || title.length > 180) return 'Invalid title';
  if (body != null && (typeof body !== 'string' || body.length > 2000)) return 'Invalid body';
  if (link != null && (typeof link !== 'string' || !link.startsWith('/') || link.startsWith('//') || link.length > 1000 || /[\r\n]/.test(link))) return 'Invalid relative link';
  return null;
}
