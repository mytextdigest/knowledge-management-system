export const EXPERTISE_HALF_LIFE_DAYS = 90;

export function expertiseDecayWeight(lastSignalAt, now = Date.now()) {
  if (!lastSignalAt) return 0.5;
  const timestamp = new Date(lastSignalAt).getTime();
  if (!Number.isFinite(timestamp)) return 0.5;
  const ageDays = Math.max(0, (Number(now) - timestamp) / 86400000);
  return Math.pow(0.5, ageDays / EXPERTISE_HALF_LIFE_DAYS);
}

// Every signal is capped - uploads used to be the sole uncapped signal,
// which let bulk-uploading alone dominate a score regardless of whether the
// uploader ever engaged with the content. Signals that require real
// understanding (asking questions about a document, authoring a published
// lesson from it) are weighted well above signals that only require a click.
export function computeExpertiseScore(signals, now = Date.now()) {
  const safe = signals || {};
  const rawScore = Math.min(1.5, Number(safe.uploads || 0) * 0.5)
    + Math.min(2.0, Number(safe.citations || 0) * 0.35)
    + Math.min(0.5, Number(safe.departments || 0) * 0.25)
    + Math.min(1.5, Number(safe.interactions || 0) * 0.15)
    + Math.min(3.0, Number(safe.documentQuestions || 0) * 0.4)
    + Math.min(4.0, Number(safe.lessonsAuthored || 0) * 2.0)
    + Math.min(3.0, Number(safe.dwellMinutes || 0) * 0.1);
  return rawScore * expertiseDecayWeight(safe.lastSignalAt, now);
}
