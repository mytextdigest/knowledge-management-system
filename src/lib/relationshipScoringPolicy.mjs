export const RELATIONSHIP_SIGNAL_WEIGHTS = Object.freeze({
  embeddingSimilarity: 0.46,
  topicOverlap: 0.18,
  entityOverlap: 0.16,
  projectContext: 0.12,
  lessonEvidence: 0.08,
});
export const RELATIONSHIP_MIN_CONFIDENCE = 0.32;
export const RELATIONSHIP_MAX_PER_DOCUMENT = 30;
const clamp = (v) => Math.max(0, Math.min(1, Number(v) || 0));
export function relationshipConfidence(signals = {}) {
  return Object.entries(RELATIONSHIP_SIGNAL_WEIGHTS).reduce((sum, [key, weight]) => sum + clamp(signals[key]) * weight, 0);
}
export function classifyRelationship({ content = "", otherName = "", signals = {} }) {
  const text = String(content).toLowerCase();
  const name = String(otherName).replace(/\.[^.]+$/, "").toLowerCase();
  if (name.length > 5 && text.includes(name)) return "references";
  if (/supersedes|replaces|obsolete|new version/.test(text)) return "supersedes";
  if (clamp(signals.lessonEvidence) > 0) return "related_to_lesson";
  if (clamp(signals.projectContext) > 0) return "related_to_project";
  if (clamp(signals.entityOverlap) > 0) return "shares_entity";
  if (clamp(signals.topicOverlap) > 0) return "shares_topic";
  return "related";
}
