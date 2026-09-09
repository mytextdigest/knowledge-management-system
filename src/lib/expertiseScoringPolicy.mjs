export const EXPERTISE_HALF_LIFE_DAYS = 90;

export function expertiseDecayWeight(lastSignalAt, now = Date.now()) {
  if (!lastSignalAt) return 0.5;
  const timestamp = new Date(lastSignalAt).getTime();
  if (!Number.isFinite(timestamp)) return 0.5;
  const ageDays = Math.max(0, (Number(now) - timestamp) / 86400000);
  return Math.pow(0.5, ageDays / EXPERTISE_HALF_LIFE_DAYS);
}

export function computeExpertiseScore(signals, now = Date.now()) {
  const safe = signals || {};
  const rawScore = Number(safe.uploads || 0) * 1.0
    + Math.min(3, Number(safe.citations || 0) * 0.35)
    + Math.min(1.5, Number(safe.departments || 0) * 0.25)
    + Math.min(2, Number(safe.interactions || 0) * 0.15);
  return rawScore * expertiseDecayWeight(safe.lastSignalAt, now);
}
