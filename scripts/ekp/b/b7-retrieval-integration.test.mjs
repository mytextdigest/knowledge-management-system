import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { filterCurrentKnowledge } from '../../../src/lib/governance/retrievalEligibility.mjs';

const rows = ['current','deleted','replaced','retired','missing','stale'].map((id) => ({ id, document_id:id }));
const docs = [
 {id:'current'}, {id:'deleted',deletedAt:new Date()},
 {id:'replaced',supersededById:'current'}, {id:'retired',lifecycle:'retired'},
 {id:'stale',lifecycleSuggestion:'archived'},
];

test('shared retrieval guard excludes removed, superseded, retired and missing docs', () => {
 assert.deepEqual(filterCurrentKnowledge(rows, docs).map((r) => r.document_id), ['current','stale']);
});
test('stale warning is advisory and not an exclusion', () => {
 assert.equal(filterCurrentKnowledge(rows, docs).at(-1).mayBeOutdated, true);
});
test('search and chat both rely on guarded hybrid retrieval through F7', () => {
 const root = new URL('../../../', import.meta.url);
 const read = (file) => readFileSync(new URL(file, root), 'utf8');
 const hybrid = read('src/lib/hybridSearch.js');
 const service = read('src/lib/search/searchService.js');
 const searchRoute = read('src/app/api/org/[orgId]/search/route.js');
 const chatRoute = read('src/app/api/org/[orgId]/chat/route.js');

 // Keep the original Phase 1 eligibility guard in the retrieval implementation.
 assert.match(hybrid, /filterCurrentKnowledge\(expanded, documents\)/);
 // F7 must delegate ordinary retrieval to the same guarded implementation.
 assert.match(service, /import\s*\{\s*hybridOrgSearch\s*\}\s*from\s*["']@\/lib\/hybridSearch["']/);
 assert.match(service, /await\s+hybridOrgSearch\(options\)/);
 // Both consumers must use F7, rather than bypassing the guarded service.
 for (const route of [searchRoute, chatRoute]) {
   assert.match(route, /from\s*["']@\/lib\/search\/searchService["']/);
   assert.match(route, /await\s+search\s*\(/);
 }
 assert.match(searchRoute, /mayBeOutdated/);
});
