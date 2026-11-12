import test from 'node:test';
import assert from 'node:assert/strict';
import { rollupUsageRange } from '../../../src/lib/analytics/rollup.mjs';
test('rolling UTC rollups cover org and departments without duplicate dates', async () => {
  const dates = [];
  const db = {
    department: { findMany: async () => [{id:'dept-a'},{id:'dept-b'}] },
    searchEvent: { findMany: async () => [] },
    searchClick: { findMany: async () => [] },
    $transaction: async fn => fn({analyticsDaily:{upsert: async ({where}) => {dates.push(where.orgId_date_metric_departmentKey_sourceSystem);}}}),
  };
  const result = await rollupUsageRange(db,{orgId:'org',days:2,now:new Date('2026-11-11T18:00:00Z')});
  assert.equal(result.rollups,6);
  assert.equal(result.metricRows,66);
  assert.equal(dates.length,66);
  assert.deepEqual([...new Set(dates.map(x=>x.date.toISOString().slice(0,10)))].sort(),['2026-11-10','2026-11-11']);
  assert.deepEqual([...new Set(dates.map(x=>x.departmentKey))].sort(),['all','dept-a','dept-b']);
});
test('invalid rollup days rejected before database access', async () => {
  await assert.rejects(rollupUsageRange({}, {orgId:'org',days:91}), /Invalid/);
});
