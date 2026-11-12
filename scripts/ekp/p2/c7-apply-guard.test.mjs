import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareImportApply, verifyImportApply } from '../../../src/lib/taxonomy/import/applyGuard.mjs';
const content = 'externalId,label,parentId\na,Alpha,\nb,Beta,a\n';
const terms = [{ id:'db-a', externalId:'a', parentId:null, label:'Alpha', description:null, status:'active' }];
const base = { termSetId:'set-1', format:'csv', content, terms };
test('confirmation token verifies unchanged preview', () => {
  const p = prepareImportApply(base);
  assert.equal(p.summary.added,1);
  assert.equal(verifyImportApply({ ...base, confirmationToken:p.confirmationToken }).verified,true);
});
test('row order does not invalidate confirmation', () => {
  const rows = [...terms, { id:'db-c', externalId:'c', parentId:null, label:'Gamma', description:null, status:'active' }];
  const p = prepareImportApply({ ...base, terms:rows });
  assert.equal(verifyImportApply({ ...base, terms:[...rows].reverse(), confirmationToken:p.confirmationToken }).verified,true);
});
test('stale database snapshot is rejected', () => {
  const p = prepareImportApply(base);
  assert.throws(() => verifyImportApply({ ...base, terms:[{...terms[0],label:'Changed'}], confirmationToken:p.confirmationToken }), /stale/);
});
test('modified import content is rejected', () => {
  const p = prepareImportApply(base);
  assert.throws(() => verifyImportApply({ ...base, content:content.replace('Beta','Changed'), confirmationToken:p.confirmationToken }), /stale/);
});
test('different term set cannot reuse token', () => {
  const p = prepareImportApply(base);
  assert.throws(() => verifyImportApply({ ...base, termSetId:'set-2', confirmationToken:p.confirmationToken }), /stale/);
});
test('invalid token rejected', () => assert.throws(() => verifyImportApply({ ...base, confirmationToken:'bad' }), /token/));
test('path-derived IDs still blocked', () => assert.throws(() => prepareImportApply({ ...base, content:'path\nA > B\n' }), /CSV|Path|path/));
