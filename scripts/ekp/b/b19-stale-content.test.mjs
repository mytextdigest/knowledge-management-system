import test from 'node:test';
import assert from 'node:assert/strict';
import { validateStaleScanOptions, staleCutoff, isStale } from '../../../src/lib/governance/staleContent.mjs';
test('defaults are bounded', () => assert.deepEqual(validateStaleScanOptions({}), { days: 180, limit: 100 }));
test('rejects unsafe thresholds', () => { assert.ok(validateStaleScanOptions({ days: 0 }).error); assert.ok(validateStaleScanOptions({ days: 3651 }).error); });
test('rejects unsafe batch sizes', () => assert.ok(validateStaleScanOptions({ limit: 1000 }).error));
test('calculates cutoff in UTC elapsed days', () => assert.equal(staleCutoff('2026-10-20T00:00:00Z', 30).toISOString(), '2026-09-20T00:00:00.000Z'));
test('identifies old content', () => assert.equal(isStale('2026-01-01', '2026-02-01'), true));
test('does not flag recently cited content', () => assert.equal(isStale('2026-10-01', '2026-09-01'), false));
