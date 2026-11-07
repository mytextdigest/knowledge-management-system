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
test('search and chat both rely on guarded hybrid retrieval', () => {
 const root = new URL('../../../', import.meta.url);
 const read = (file) => readFileSync(new URL(file, root), 'utf8');
 assert.match(read('src/lib/hybridSearch.js'), /filterCurrentKnowledge\(expanded, documents\)/);
 assert.match(read('src/app/api/org/[orgId]/search/route.js'), /hybridOrgSearch/);
 assert.match(read('src/app/api/org/[orgId]/chat/route.js'), /hybridOrgSearch/);
 assert.match(read('src/app/api/org/[orgId]/search/route.js'), /mayBeOutdated/);
});
