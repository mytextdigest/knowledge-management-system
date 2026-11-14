export function calculatePurgeAfter(now, retentionDays) {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) throw new Error('Invalid deletion date');
  if (retentionDays === null) return null;
  if (!Number.isInteger(retentionDays) || retentionDays < 1 || retentionDays > 36500) throw new Error('Invalid retention days');
  return new Date(now.getTime() + retentionDays * 86400000);
}
export function isDeleted(document) { return document?.deletedAt != null; }
