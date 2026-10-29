export function validateStaleScanOptions(input = {}) {
 const days = input.days ?? 180;
 const limit = input.limit ?? 100;
 if (!Number.isInteger(days) || days < 30 || days > 3650) return { error: 'days must be 30–3650' };
 if (!Number.isInteger(limit) || limit < 1 || limit > 200) return { error: 'limit must be 1–200' };
 return { days, limit };
}
export function staleCutoff(now, days) { return new Date(new Date(now).getTime() - days * 86400000); }
export function isStale(lastUsedAt, cutoff) { return new Date(lastUsedAt).getTime() <= new Date(cutoff).getTime(); }
