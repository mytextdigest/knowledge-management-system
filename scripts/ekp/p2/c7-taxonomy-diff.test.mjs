import test from 'node:test';
import assert from 'node:assert/strict';
import { previewTaxonomyDiff } from '../../../src/lib/taxonomy/import/diff.mjs';
const concept = (externalId, label, parentExternalId = null) => ({ externalId, label, parentExternalId });
test('preview is read-only and reports additions', () => {
  const incoming = { concepts: [concept('A','Alpha')] };
  const preview = previewTaxonomyDiff(incoming, []);
  assert.equal(preview.summary.added, 1);
  assert.equal(preview.safeToApplyAutomatically, false);
  assert.equal(incoming.concepts.length, 1);
});
test('rename and move are keyed by stable externalId', () => {
  const p = previewTaxonomyDiff({ concepts: [concept('P','Parent'), concept('C','New name','P')] }, [
    { externalId:'P', label:'Parent', parentExternalId:null },
    { externalId:'C', label:'Old name', parentExternalId:null }
  ]);
  assert.equal(p.summary.moved, 1);
  assert.equal(p.actions.find(a=>a.externalId==='C').renamed, true);
});
test('missing terms are deprecated, never deleted', () => {
  const p = previewTaxonomyDiff({ concepts: [] }, [{externalId:'X',label:'Retired',status:'active'}]);
  assert.equal(p.actions[0].type, 'deprecate');
});
test('path derived IDs are blocked for safe resync', () => {
  assert.throws(()=>previewTaxonomyDiff({concepts:[concept('csv:path:alpha','Alpha')]}, []), /Path-derived/);
});
test('missing parents and cycles rejected', () => {
  assert.throws(()=>previewTaxonomyDiff({concepts:[concept('A','Alpha','missing')]}, []), /Missing imported parent/);
  assert.throws(()=>previewTaxonomyDiff({concepts:[concept('A','Alpha','B'),concept('B','Beta','A')]}, []), /Cycle/);
});
test('reactivation is an update', () => {
  const p = previewTaxonomyDiff({concepts:[concept('A','Alpha')]}, [{externalId:'A',label:'Alpha',status:'deprecated'}]);
  assert.equal(p.summary.updated, 1);
});
