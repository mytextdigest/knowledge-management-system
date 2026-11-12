import test from 'node:test';
import assert from 'node:assert/strict';
import { buildApplyPlan, calculateHierarchy, normalizeImportedSynonyms } from '../../../src/lib/taxonomy/import/applyPlan.mjs';
const concepts = [
 { externalId:'child', label:'Child', parentExternalId:'root', synonyms:['Alias','alias'], hiddenLabels:['Secret'] },
 { externalId:'root', label:'Root', parentExternalId:null },
];
test('parent-first ordering independent of file order', () => assert.deepEqual(buildApplyPlan(concepts).map(x=>x.externalId),['root','child']));
test('hierarchy recalculated with real DB IDs', () => {
 const tree=calculateHierarchy(concepts,new Map([['root','r1'],['child','c1']]));
 assert.deepEqual(tree.get('child'), { id:'c1',parentId:'r1',ancestorIds:['r1'],depth:1 });
});
test('duplicate sibling labels rejected',()=> assert.throws(()=>buildApplyPlan([{externalId:'a',label:'Hi'},{externalId:'b',label:' hi '}]),/Duplicate sibling/));
test('path derived identifiers blocked',()=>assert.throws(()=>buildApplyPlan([{externalId:'csv:path:foo',label:'Foo'}]),/Stable external/));
test('synonyms deduplicated with kinds',()=>assert.deepEqual(normalizeImportedSynonyms(concepts[0]).map(x=>x.kind),['alt','hidden']));
test('cycles rejected',()=>assert.throws(()=>buildApplyPlan([{externalId:'a',label:'A',parentExternalId:'b'},{externalId:'b',label:'B',parentExternalId:'a'}]),/Cycle/));
