import test from 'node:test';
import assert from 'node:assert/strict';
import { calculatePurgeAfter, isDeleted } from '../../../src/lib/lifecycle/softDelete.mjs';
test('calculates retention deadline', () => {
  const start = new Date('2026-10-19T00:00:00Z');
  assert.equal(calculatePurgeAfter(start, 30).toISOString(), '2026-11-18T00:00:00.000Z');
});
test('rejects unsafe retention settings', () => {
  for (const days of [0, -1, 1.5, Infinity]) assert.throws(() => calculatePurgeAfter(new Date(), days));
});
test('recognizes deleted and restored records', () => {
  assert.equal(isDeleted({ deletedAt: new Date() }), true);
  assert.equal(isDeleted({ deletedAt: null }), false);
});
