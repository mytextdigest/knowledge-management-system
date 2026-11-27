import test from 'node:test';
import assert from 'node:assert/strict';
import { parseTaxonomyCsv, readCsv } from '../../../src/lib/taxonomy/import/csv.mjs';

test('RFC CSV quoted values and multiline cells', () => {
  assert.deepEqual(readCsv('id,label\r\na,"One, two"\r\nb,"Line 1\nLine 2"\r\n')[1], ['a','One, two']);
});
test('path CSV generates deterministic hierarchy', () => {
  const { concepts } = parseTaxonomyCsv('path,synonyms\nAsset > Transformer,TX|Xformer\nAsset > Generator,Gen');
  assert.equal(concepts.length, 3);
  assert.equal(concepts[1].parentExternalId, concepts[0].externalId);
  assert.deepEqual(concepts[1].synonyms, ['TX','Xformer']);
});
test('parent CSV validates missing parents and cycles', () => {
  assert.throws(() => parseTaxonomyCsv('id,label,parentId\na,A,missing'), /Missing parent/);
  assert.throws(() => parseTaxonomyCsv('id,label,parentId\na,A,b\nb,B,a'), /Cycle/);
});
test('duplicate conflicting identifiers rejected', () => {
  assert.throws(() => parseTaxonomyCsv('id,label\na,A\na,B'), /conflicting/);
});
