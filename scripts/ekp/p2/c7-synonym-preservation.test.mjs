import test from 'node:test';
import assert from 'node:assert/strict';
import { planSafeSynonymUpserts } from '../../../src/lib/taxonomy/import/synonymSafety.mjs';
import { prepareImportApply, verifyImportApply } from '../../../src/lib/taxonomy/import/applyGuard.mjs';
const old = [{ normalizedLabel:'local alias',kind:'alt' }];
test('re-import retains local aliases and only adds missing synonyms', () => {
  assert.deepEqual(planSafeSynonymUpserts(old,[{normalizedLabel:'new alias',kind:'hidden'}]), {
    additions:[{normalizedLabel:'new alias',kind:'hidden'}],retained:1
  });
});
test('re-import never rewrites synonym kind without review', () => {
  assert.throws(()=>planSafeSynonymUpserts(old,[{normalizedLabel:'local alias',kind:'hidden'}]),/requires review/);
});
test('preview token invalidated by concurrent synonym edits', () => {
  const content='externalId,label\nterm-1,One';
  const terms=[{id:'db1',externalId:'term-1',label:'One',parentId:null,description:null,status:'active',synonyms:[]}];
  const first=prepareImportApply({termSetId:'set',format:'csv',content,terms});
  const edited=[{...terms[0],synonyms:[{normalizedLabel:'other',kind:'alt'}]}];
  assert.throws(()=>verifyImportApply({termSetId:'set',format:'csv',content,terms:edited,confirmationToken:first.confirmationToken}),/stale/);
});
