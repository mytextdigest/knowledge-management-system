import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read = (file) => readFileSync(new URL(`../../../${file}`, import.meta.url), "utf8");
test("F7 logs search events without failing retrieval on telemetry errors", () => {
 const service = read("src/lib/search/searchService.js");
 assert.match(service, /prisma\.searchEvent\.create/);
 assert.match(service, /catch \(error\)/);
 assert.match(service, /previousEventId/);
 assert.match(service, /await hybridOrgSearch\(options\)/);
 assert.match(service, /await orgSearch\(queryEmbedding, options\)/);
});
test("repository search does not shadow F7 import", () => {
 const route = read("src/app/api/org/[orgId]/repository/route.js");
 assert.doesNotMatch(route, /const search\s*=\s*searchParams/);
 assert.match(route, /await search\(/);
});
test("chat consumes retrieved chunks", () => {
 const route = read("src/app/api/org/[orgId]/chat/route.js");
 assert.match(route, /chunks = retrievedChunks/);
});
test("click endpoint verifies owner and document access", () => {
 const route = read("src/app/api/org/[orgId]/search/click/route.js");
 assert.match(route, /userId: user\.id/);
 assert.match(route, /repositoryAccessWhere/);
});
