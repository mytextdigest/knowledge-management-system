import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (file) => readFileSync(new URL(`../../../${file}`, import.meta.url), "utf8");

test("F7 delegates unchanged to Phase 1 retrieval implementations", () => {
  const service = read("src/lib/search/searchService.js");
  assert.match(service, /await orgSearch\(queryEmbedding, options\)/);
  assert.match(service, /await hybridOrgSearch\(options\)/);
  assert.doesNotMatch(service, /sort\(|reverse\(/);
});

test("all existing retrieval consumers call F7", () => {
  for (const file of [
    "src/app/api/org/[orgId]/search/route.js",
    "src/app/api/org/[orgId]/chat/route.js",
    "src/app/api/org/[orgId]/repository/route.js",
    "src/lib/recommendations.js",
  ]) {
    const source = read(file);
    assert.match(source, /@\/lib\/search\/searchService/);
    assert.doesNotMatch(source, /import \{ hybridOrgSearch \}|import \{ orgSearch \}/);
  }
});
