import test from 'node:test';
import assert from 'node:assert/strict';
import { buildImportPreview } from '../../../src/lib/taxonomy/import/preview.mjs';
const csv = 'externalId,label,parentId\nroot,New Root,\nchild,Child,root\n';
const stored = [
  { id: 'db1', externalId: 'root', label: 'Old Root', parentId: null, status: 'active' },
  { id: 'db2', externalId: 'child', label: 'Child', parentId: 'db1', status: 'active' },
];
test('resolves DB parent IDs into stable external IDs', () => {
  const p = buildImportPreview({ format: 'csv', content: csv, terms: stored });
  assert.equal(p.summary.updated, 1);
  assert.equal(p.summary.moved, 0);
  assert.equal(p.summary.unchanged, 1);
  assert.equal(p.previewOnly, undefined);
  assert.equal(p.safeToApplyAutomatically, false);
});
test('blocks local terms without stable IDs', () => assert.throws(() => buildImportPreview({ format:'csv', content:csv, terms:[{ id:'db1', externalId:null }] }), /stable external IDs/));
test('blocks path-derived IDs on resync', () => assert.throws(() => buildImportPreview({ format:'csv', content:'path\nA > B', terms:[] }), /Path-derived IDs/));
test('blocks missing stored parent', () => assert.throws(() => buildImportPreview({ format:'csv', content:csv, terms:[{ id:'db2', externalId:'child', parentId:'missing' }] }), /missing parent/));
test('blocks oversized imports and unsupported formats', () => {
  assert.throws(() => buildImportPreview({ format:'json', content:csv }), /Unsupported/);
  assert.throws(() => buildImportPreview({ format:'csv', content:'x'.repeat(2*1024*1024+1) }), /exceeds/);
});
test('reports deprecation without deleting stored terms', () => {
  const p = buildImportPreview({ format:'csv', content:'externalId,label\nroot,Old Root', terms:stored });
  assert.equal(p.summary.deprecated, 1);
  assert.equal(p.actions.find(x => x.externalId === 'child').type, 'deprecate');
});
