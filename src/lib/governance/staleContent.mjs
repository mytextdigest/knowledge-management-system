export function validateStaleScanOptions(input = {}) {
 const days = input.days ?? 180;
 const limit = input.limit ?? 100;
 if (!Number.isInteger(days) || days < 30 || days > 3650) return { error: 'days must be 30–3650' };
 if (!Number.isInteger(limit) || limit < 1 || limit > 200) return { error: 'limit must be 1–200' };
 return { days, limit };
}
export function staleCutoff(now, days) { return new Date(new Date(now).getTime() - days * 86400000); }
export function isStale(lastUsedAt, cutoff) { return new Date(lastUsedAt).getTime() <= new Date(cutoff).getTime(); }

const latest = (...dates) => dates.filter(Boolean).map((d) => new Date(d)).reduce((a, b) => (b > a ? b : a), new Date(0));

/**
 * B-19 (E26): is a document stale under the org's stale.rules setting
 * ({ noUpdateDays, noViewDays }; 0 turns a rule off)? Content counts as
 * changed at creation, at a source modification and at a replaced version;
 * as used at creation, at a view and at a chat citation.
 * Returns { stale, reasons[] } with one sentence per rule that matched.
 */
export function evaluateStaleness({ createdAt, sourceModifiedAt, lastVersionAt, lastViewedAt, lastCitedAt }, rules, now = new Date()) {
  const reasons = [];
  const lastChanged = latest(createdAt, sourceModifiedAt, lastVersionAt);
  const lastUsed = latest(createdAt, lastViewedAt, lastCitedAt);
  if (rules?.noUpdateDays > 0 && isStale(lastChanged, staleCutoff(now, rules.noUpdateDays))) {
    reasons.push(`Not updated for at least ${rules.noUpdateDays} days`);
  }
  if (rules?.noViewDays > 0 && isStale(lastUsed, staleCutoff(now, rules.noViewDays))) {
    reasons.push(`Not viewed or cited in chat for at least ${rules.noViewDays} days`);
  }
  return { stale: reasons.length > 0, reasons };
}
