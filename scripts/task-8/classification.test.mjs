import test from "node:test";
import assert from "node:assert/strict";
import {
  CATEGORY_TAXONOMY,
  averageEmbeddings,
  computeContentHash,
  cosineSimilarity,
  isClassificationRelevant,
} from "../../worker/classify.js";

test("taxonomy remains the repository contract", () => {
  assert.deepEqual(CATEGORY_TAXONOMY, [
    "Policies", "SOPs", "Reports", "Meeting Knowledge",
    "Product Knowledge", "Historical Documents", "Other",
  ]);
});

test("content hash is whitespace and case stable", () => {
  assert.equal(computeContentHash(" Hello   WORLD "), computeContentHash("hello world"));
});

test("average embedding and cosine similarity identify near duplicates", () => {
  const avg = averageEmbeddings([[1, 0], [0.8, 0.2]]);
  assert.deepEqual(avg, [0.9, 0.1]);
  assert.ok(cosineSimilarity(avg, [0.89, 0.11]) > 0.99);
  assert.ok(cosineSimilarity(avg, [0, 1]) < 0.2);
});


test("classification spend is limited to repository-visible knowledge", () => {
  assert.equal(isClassificationRelevant({ scope: "repository", orgId: "org-1" }), true);
  assert.equal(isClassificationRelevant({ scope: "project", project: { scope: "org", orgId: "org-1" } }), true);
  assert.equal(isClassificationRelevant({ scope: "private", orgId: "org-1" }), false);
  assert.equal(isClassificationRelevant({ scope: "project", project: { scope: "private", orgId: "org-1" } }), false);
});
