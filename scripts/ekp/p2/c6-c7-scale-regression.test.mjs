import test from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { parseTaxonomyCsv } from '../../../src/lib/taxonomy/import/csv.mjs';
import { previewTaxonomyDiff } from '../../../src/lib/taxonomy/import/diff.mjs';

const SIZE = 2600;
function fixture() {
  const lines = ['externalId,label,parentExternalId,description'];
  for (let i = 0; i < SIZE; i++) {
    const depth = i % 8;
    const parent = depth === 0 ? '' : `term-${i-1}`;
    lines.push(`term-${i},Term ${i},${parent},Description ${i}`);
  }
  return lines.join('\n');
}

test('C-6 parses 2,600 stable-ID CSV concepts, maximum 8 levels, without losing hierarchy', () => {
  const start = performance.now();
  const parsed = parseTaxonomyCsv(fixture());
  const elapsed = performance.now() - start;
  assert.equal(parsed.concepts.length, SIZE);
  assert.equal(parsed.concepts[7].parentExternalId, 'term-6');
  assert.equal(parsed.concepts[8].parentExternalId, null);
  assert.ok(elapsed < 60_000, `CSV parsing took ${elapsed.toFixed(1)} ms`);
  console.log(`C-6 parse-only: ${SIZE} concepts in ${elapsed.toFixed(1)} ms`);
});

test('C-7 previews initial import and unchanged re-import without writes', () => {
  const parsed = parseTaxonomyCsv(fixture());
  const start = performance.now();
  const initial = previewTaxonomyDiff(parsed, []);
  assert.equal(initial.summary.added, SIZE);
  const existing = parsed.concepts.map(c => ({ ...c, status: 'active' }));
  const unchanged = previewTaxonomyDiff(parsed, existing);
  assert.equal(unchanged.summary.unchanged, SIZE);
  assert.equal(unchanged.summary.added, 0);
  const elapsed = performance.now() - start;
  assert.ok(elapsed < 60_000, `Preview-only operations took ${elapsed.toFixed(1)} ms`);
  console.log(`C-7 diff-only: initial + unchanged previews in ${elapsed.toFixed(1)} ms`);
});

test('C-7 detects stable-ID rename and move without interpreting as deletion', () => {
  const parsed = parseTaxonomyCsv(fixture());
  const existing = parsed.concepts.map(c => ({ ...c, status: 'active' }));
  const updated = structuredClone(parsed);
  updated.concepts[9].label = 'Renamed term';
  updated.concepts[9].parentExternalId = 'term-0';
  const diff = previewTaxonomyDiff(updated, existing);
  assert.equal(diff.summary.moved, 1);
  assert.equal(diff.summary.deprecated, 0);
  assert.equal(diff.summary.added, 0);
  assert.equal(diff.safeToApplyAutomatically, false);
});
