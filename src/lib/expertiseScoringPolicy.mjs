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
//
// Declared in the same order computeExpertiseScore sums them in, so the two
// can never drift apart into different numbers for the same signals.
export const EXPERTISE_SIGNAL_DEFINITIONS = [
  { key: "uploads", label: "Documents uploaded", unit: "upload", unitValue: 0.5, cap: 1.5 },
  { key: "citations", label: "Cited in an AI-generated answer", unit: "citation", unitValue: 0.35, cap: 2.0 },
  { key: "departments", label: "Department overlap with the topic", unit: "department", unitValue: 0.25, cap: 0.5 },
  { key: "interactions", label: "Document viewed or downloaded", unit: "view/download", unitValue: 0.15, cap: 1.5 },
  { key: "documentQuestions", label: "Question asked about a document", unit: "question", unitValue: 0.4, cap: 3.0 },
  { key: "lessonsAuthored", label: "Published Lesson Learned authored", unit: "lesson", unitValue: 2.0, cap: 4.0 },
  { key: "dwellMinutes", label: "Minute of focused reading", unit: "minute", unitValue: 0.1, cap: 3.0, isContinuous: true },
];

// Same math as computeExpertiseScore, but returns the itemized breakdown
// behind the number - which signals fired, how many, how much each
// contributed (after its own cap), and the decay applied - so a score can be
// explained rather than just shown.
export function explainExpertiseScore(signals, now = Date.now()) {
  const safe = signals || {};
  let rawScore = 0;
  const contributions = [];
  for (const def of EXPERTISE_SIGNAL_DEFINITIONS) {
    const count = Number(safe[def.key] || 0);
    const rawContribution = count * def.unitValue;
    const contribution = Math.min(def.cap, rawContribution);
    rawScore += contribution;
    if (count > 0) {
      contributions.push({ ...def, count, contribution, isCapped: rawContribution > def.cap + 1e-9 });
    }
  }
  const decayWeight = expertiseDecayWeight(safe.lastSignalAt, now);
  return {
    rawScore,
    decayWeight,
    finalScore: rawScore * decayWeight,
    lastSignalAt: safe.lastSignalAt || null,
    breakdown: contributions.sort((a, b) => b.contribution - a.contribution),
  };
}

export function computeExpertiseScore(signals, now = Date.now()) {
  return explainExpertiseScore(signals, now).finalScore;
}
