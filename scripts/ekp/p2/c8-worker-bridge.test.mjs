import test from 'node:test';
import assert from 'node:assert/strict';
import { createTaxonomyAwareSourceTagReader } from '../../../src/lib/taxonomy/import/sharepointWorkerBridge.mjs';

const args = { documentId: 'doc1', driveId: 'drive', itemId: 'item' };
const db = { $transaction: async () => { throw new Error('transaction should not be called'); } };
test('without an approved mapping raw SharePoint sync is unchanged', async () => {
  let called = 0;
  const reader = createTaxonomyAwareSourceTagReader({reader: {sync: async () => { called++; return 2; }}, db, orgId:'org1'});
  assert.equal(await reader.sync(args), 2);
  assert.equal(called, 1);
});
test('missing Graph item cannot trigger destructive reconciliation', async () => {
  const reader = createTaxonomyAwareSourceTagReader({reader:{sync:async()=>null},db,orgId:'org1',fieldBySourceName:{Category:'field1'}});
  assert.equal(await reader.sync(args), null);
});
test('invalid mappings fail closed before any worker sync', () => {
  assert.throws(() => createTaxonomyAwareSourceTagReader({reader:{sync:async()=>1},db,orgId:'org1',fieldBySourceName:{Category:''}}), /Invalid/);
});
test('reconciliation failures propagate without hiding a partially processed document', async () => {
  const db2 = {$transaction: async () => { throw new Error('mapping transaction failed'); }};
  const reader = createTaxonomyAwareSourceTagReader({reader:{sync:async()=>1},db:db2,orgId:'org1',fieldBySourceName:{Category:'field1'}});
  await assert.rejects(reader.sync(args), /mapping transaction failed/);
});
