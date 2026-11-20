// D-M2 acceptance: each E29 metric checked against hand-computed values.
// Run: node --test scripts/ekp/p2/d6-d7-usage.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { computeMetrics, computeDay, followUpIds, withRates, sumMetrics, usageCsv, percentile } from '../../../src/lib/analytics/usageMetrics.mjs';
import { computeUsageDayGroups, rowsForDay, rollupUsageRange } from '../../../src/lib/analytics/rollup.mjs';

const t = (hhmmss) => new Date(`2026-11-10T${hhmmss}Z`);
// u1: search a (clicked after 4 s), search b 30 s later (so a was followed up),
//     question c 4.5 min after b (too late to count as b's follow-up: b bounces),
//     first token after 2.5 s.
// u2: search d (no click, no follow-up: bounce), search e (clicked after 10 s).
// u3: search f at 23:59:30 followed by u3's search g next day at 00:00:10
//     (follow-up across midnight, so f is not a bounce).
const events = [
  { id: 'a', userId: 'u1', kind: 'search', createdAt: t('09:00:00'), latencyMs: 100, role: 'member', departmentId: 'eng' },
  { id: 'b', userId: 'u1', kind: 'repository', createdAt: t('09:00:30'), latencyMs: 300, role: 'member', departmentId: 'eng' },
  { id: 'c', userId: 'u1', kind: 'chat', createdAt: t('09:05:00'), latencyMs: 200, firstTokenMs: 2500, role: 'member', departmentId: 'eng' },
  { id: 'd', userId: 'u2', kind: 'search', createdAt: t('10:00:00'), latencyMs: 400, role: 'guest', departmentId: 'ops' },
  { id: 'e', userId: 'u2', kind: 'search', createdAt: t('11:00:00'), latencyMs: 500, role: 'guest', departmentId: 'ops' },
  { id: 'f', userId: 'u3', kind: 'search', createdAt: t('23:59:30'), latencyMs: 600, role: 'member', departmentId: null },
];
const nextDay = { id: 'g', userId: 'u3', kind: 'search', createdAt: new Date('2026-11-11T00:00:10Z'), latencyMs: 50, role: 'member', departmentId: null };
const clicks = [
  { searchEventId: 'a', clickedAt: t('09:00:04') },
  { searchEventId: 'a', clickedAt: t('09:00:20') },
  { searchEventId: 'e', clickedAt: t('11:00:10') },
];
const firstClicks = new Map([['a', t('09:00:04')], ['e', t('11:00:10')]]);

test('follow-ups: same user within 60 s, including across midnight', () => {
  const ids = followUpIds(events, [...events, nextDay]);
  assert.deepEqual([...ids].sort(), ['a', 'f']);
});

test('E29 metrics for the day match hand-computed values', () => {
  const followed = followUpIds(events, [...events, nextDay]);
  const m = withRates(computeMetrics(events, firstClicks, followed));
  assert.equal(m.searches, 5);                 // a b d e f
  assert.equal(m.questions, 1);                // c
  assert.equal(m.activeUsers, 3);
  assert.equal(m.clickedSearches, 2);          // a e
  assert.equal(m.ctr, 2 / 5);
  assert.equal(m.bouncedSearches, 2);          // b and d
  assert.equal(m.bounceRate, 2 / 5);
  // Time to answer: a 4 s, e 10 s (first clicks), c 2.5 s (first token).
  assert.equal(m.timeToAnswerCount, 3);
  assert.equal(m.avgTimeToAnswerMs, Math.round((4000 + 10000 + 2500) / 3));
  assert.equal(m.p50TimeToAnswerMs, 4000);
  assert.equal(m.p50LatencyMs, 350);
  assert.equal(m.avgLatencyMs, 350);
});

test('by role and summing keep rates consistent', () => {
  const day = computeDay(events, firstClicks, followUpIds(events, [...events, nextDay]));
  assert.equal(day.byRole.member.searches, 3);
  assert.equal(day.byRole.guest.searches, 2);
  assert.equal(day.byRole.guest.bouncedSearches, 1);
  const summed = withRates(sumMetrics([day.byRole.member, day.byRole.guest]));
  assert.equal(summed.searches, day.total.searches);
  assert.equal(summed.ctr, 2 / 5);
});

test('roll-up reads the day plus one minute and groups by department', async () => {
  const all = [...events, nextDay];
  const db = {
    searchEvent: { findMany: async ({ where }) => all.filter((e) => e.createdAt >= where.createdAt.gte && e.createdAt < where.createdAt.lt) },
    searchClick: { groupBy: async ({ where }) => [...firstClicks].filter(([id]) => where.searchEventId.in.includes(id)).map(([searchEventId, at]) => ({ searchEventId, _min: { clickedAt: at } })) },
  };
  const groups = await computeUsageDayGroups(db, { orgId: 'org', date: '2026-11-10' });
  assert.deepEqual(Object.keys(groups).sort(), ['all', 'eng', 'ops']);
  assert.equal(groups.all.total.events, 6);   // g belongs to the next day
  assert.equal(groups.all.total.bouncedSearches, 2);
  assert.equal(groups.eng.total.clickedSearches, 1);
  const rows = rowsForDay('org', '2026-11-10', groups);
  const ctrRow = rows.find((r) => r.departmentKey === 'ops' && r.metric === 'clickedSearches');
  assert.equal(ctrRow.value, 1);
  assert.deepEqual(ctrRow.dims.byRole, { guest: 1 });
  assert.ok(rows.every((r) => r.sourceSystem === 'all' && r.date.toISOString() === '2026-11-10T00:00:00.000Z'));
});

test('roll-up replaces a day atomically (idempotent)', async () => {
  const calls = [];
  const db = {
    searchEvent: { findMany: async () => [] },
    searchClick: { groupBy: async () => [] },
    analyticsDaily: {
      deleteMany: (args) => ({ op: 'deleteMany', args }),
      createMany: (args) => ({ op: 'createMany', args }),
    },
    $transaction: async (ops) => { calls.push(ops.map((o) => o.op)); return []; },
  };
  const result = await rollupUsageRange(db, { orgId: 'org', days: 2, now: new Date('2026-11-11T18:00:00Z') });
  assert.equal(result.days, 2);
  assert.deepEqual(calls, [['deleteMany', 'createMany'], ['deleteMany', 'createMany']]);
  await assert.rejects(rollupUsageRange(db, { orgId: 'org', days: 0 }), /Invalid/);
});

test('CSV quoting and formula injection, percentiles of empty sets', () => {
  assert.equal(percentile([], 0.5), null);
  const csv = usageCsv([{ date: '2026-11-10', searches: '=HYPERLINK("x")' }], ['date', 'searches']);
  assert.match(csv, /^date,searches\r\n2026-11-10,"'=HYPERLINK\(""x""\)"\r\n$/);
  assert.equal(clicks.length, 3);
});
