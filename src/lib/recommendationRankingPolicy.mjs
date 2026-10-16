export function recommendationFeedbackDelta(feedback) {
  if (["up", "helpful"].includes(feedback)) return 0.08;
  if (["down", "not_helpful"].includes(feedback)) return -0.12;
  return 0;
}

export function accumulateFeedbackWeight(current, feedback) {
  const next = Number(current || 0) + recommendationFeedbackDelta(feedback);
  return Math.max(-0.3, Math.min(0.3, next));
}

export function scoreRecommendation(baseScore, feedbackWeight = 0) {
  return Number(baseScore || 0) + Number(feedbackWeight || 0);
}
