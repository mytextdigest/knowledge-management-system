// D-6: F3 job `analytics.rollup`. Computes each UTC day's usage metrics into
// AnalyticsDaily, for the whole org ("all") and for every department that had
// activity. Re-running a day replaces its rows, so the job is idempotent and
// can recompute recent days to pick up late clicks.
import { computeDay, followUpIds, FOLLOW_UP_MS, STORED_METRICS } from './usageMetrics.mjs';

const DAY_MS = 86_400_000;
const PAGE = 1000;

export function dayStart(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date))) throw new Error('Invalid UTC date');
  const start = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(start.getTime()) || start.toISOString().slice(0, 10) !== date) throw new Error('Invalid UTC date');
  return start;
}

/**
 * Reads one UTC day's events (plus the first minute after it, for follow-ups)
 * and returns { all, [departmentId]: … }, each { total, byRole }. Read-only.
 */
export async function computeUsageDayGroups(db, { orgId, date }) {
  if (!orgId) throw new Error('orgId required');
  const start = dayStart(date);
  const end = new Date(start.getTime() + DAY_MS);
  const window = { orgId, createdAt: { gte: start, lt: new Date(end.getTime() + FOLLOW_UP_MS) } };
  const fetched = [];
  let cursor;
  do {
    const page = await db.searchEvent.findMany({
      where: window,
      select: { id: true, userId: true, kind: true, createdAt: true, latencyMs: true, firstTokenMs: true, role: true, departmentId: true },
      orderBy: { id: 'asc' },
      take: PAGE,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    fetched.push(...page);
    cursor = page.length === PAGE ? page[page.length - 1].id : null;
  } while (cursor);

  const events = fetched.filter((e) => new Date(e.createdAt) < end);
  const firstClicks = new Map();
  for (let i = 0; i < events.length; i += PAGE) {
    const ids = events.slice(i, i + PAGE).map((e) => e.id);
    const rows = await db.searchClick.groupBy({ by: ['searchEventId'], where: { searchEventId: { in: ids } }, _min: { clickedAt: true } });
    for (const r of rows) firstClicks.set(r.searchEventId, r._min.clickedAt);
  }
  const followedUp = followUpIds(events, fetched);

  const groups = { all: computeDay(events, firstClicks, followedUp) };
  const byDepartment = new Map();
  for (const e of events) {
    if (!e.departmentId) continue;
    if (!byDepartment.has(e.departmentId)) byDepartment.set(e.departmentId, []);
    byDepartment.get(e.departmentId).push(e);
  }
  for (const [departmentId, list] of byDepartment) groups[departmentId] = computeDay(list, firstClicks, followedUp);
  return groups;
}

/** AnalyticsDaily rows for one day's groups. value = total, dims.byRole = per role. */
export function rowsForDay(orgId, date, groups, computedAt = new Date()) {
  const rows = [];
  for (const [departmentKey, { total, byRole }] of Object.entries(groups)) {
    for (const metric of STORED_METRICS) {
      const roleValues = Object.fromEntries(Object.entries(byRole).map(([role, m]) => [role, m[metric]]));
      rows.push({
        orgId, date: dayStart(date), metric, departmentKey, sourceSystem: 'all',
        value: total[metric] ?? 0,
        // Percentiles can be null (no data); value stays 0 and dims says so.
        dims: { byRole: roleValues, ...(total[metric] === null ? { empty: true } : {}) },
        computedAt,
      });
    }
  }
  return rows;
}

export async function rollupUsageDay(db, { orgId, date }) {
  const groups = await computeUsageDayGroups(db, { orgId, date });
  const rows = rowsForDay(orgId, date, groups);
  await db.$transaction([
    db.analyticsDaily.deleteMany({ where: { orgId, date: dayStart(date), metric: { in: STORED_METRICS }, sourceSystem: 'all' } }),
    db.analyticsDaily.createMany({ data: rows }),
  ]);
  return { date, groups: Object.keys(groups).length, rows: rows.length, events: groups.all.total.events };
}

/** F3 entry point: today and the previous `days - 1` UTC days. */
export async function rollupUsageRange(db, { orgId, days = 3, now = new Date() }) {
  if (!orgId || !Number.isInteger(days) || days < 1 || days > 400) throw new Error('Invalid usage rollup scope');
  const anchor = new Date(now);
  if (Number.isNaN(anchor.getTime())) throw new Error('Invalid rollup timestamp');
  anchor.setUTCHours(0, 0, 0, 0);
  const results = [];
  for (let offset = days - 1; offset >= 0; offset--) {
    const date = new Date(anchor.getTime() - offset * DAY_MS).toISOString().slice(0, 10);
    results.push(await rollupUsageDay(db, { orgId, date }));
  }
  return { days, rows: results.reduce((n, r) => n + r.rows, 0), events: results.reduce((n, r) => n + r.events, 0) };
}
