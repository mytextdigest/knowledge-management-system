import test from "node:test";
import assert from "node:assert/strict";
import { accumulateFeedbackWeight, recommendationFeedbackDelta, scoreRecommendation } from "../../src/lib/recommendationRankingPolicy.mjs";

test("not_helpful feedback measurably deprioritizes a document", () => {
  const base = 0.72;
  const helpful = scoreRecommendation(base, accumulateFeedbackWeight(0, "helpful"));
  const notHelpful = scoreRecommendation(base, accumulateFeedbackWeight(0, "not_helpful"));
  assert.equal(recommendationFeedbackDelta("not_helpful"), -0.12);
  assert.ok(notHelpful < base);
  assert.ok(notHelpful < helpful);
});

test("feedback accumulation is bounded", () => {
  let positive = 0;
  let negative = 0;
  for (let i = 0; i < 10; i += 1) {
    positive = accumulateFeedbackWeight(positive, "helpful");
    negative = accumulateFeedbackWeight(negative, "not_helpful");
  }
  assert.equal(positive, 0.3);
  assert.equal(negative, -0.3);
});
