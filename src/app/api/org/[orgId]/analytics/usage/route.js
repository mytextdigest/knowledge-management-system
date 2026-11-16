import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { resolveOrgRole } from '@/lib/orgGuard';
import { computeUsageDayGroups } from '@/lib/analytics/rollup.mjs';
import { STORED_METRICS, sumMetrics, withRates, usageCsv } from '@/lib/analytics/usageMetrics.mjs';

// D-7: Usage & adoption (E29). Daily series come from the AnalyticsDaily
// roll-up (D-6); today, and any past day the roll-up hasn't covered yet, are
// computed live. Period figures that can't be summed from daily rows (distinct
// users, percentiles, breakdowns, top queries) are SQL aggregates, never raw
// rows sent to the server or the browser.

const DAY_MS = 86_400_000;
const deny = (error, status) => NextResponse.json({ error }, { status, headers: { 'Cache-Control': 'no-store' } });
const ROLES = ['super_admin', 'dept_admin', 'member', 'guest'];
const round1 = (n) => (n === null || n === undefined ? null : Math.round(Number(n) * 10) / 10);

// Pick the role's figure from a stored or live group, or the total.
function pickMetrics(group, role) {
  if (!group) return null;
  return role ? (group.byRole?.[role] ?? null) : group.total;
}

export async function GET(request, { params }) {
  const { orgId } = await params;
  const session = await getServerSession();
  if (!session?.user?.email) return deny('Unauthorized', 401);
  const { user, role } = await resolveOrgRole(session.user.email, orgId);
  if (!user || !['super_admin', 'dept_admin'].includes(role)) return deny('Forbidden', 403);

  const url = new URL(request.url);
  const days = Number(url.searchParams.get('days') || 30);
  if (![7, 30, 90].includes(days)) return deny('Invalid reporting period', 400);
  const requestedDepartment = url.searchParams.get('departmentId') || null;
  const requestedRole = url.searchParams.get('role') || null;
  if (requestedRole && !ROLES.includes(requestedRole)) return deny('Invalid role', 400);

  // Department admins report only on departments they administer.
  let permittedDepartments = null;
  if (role === 'dept_admin') {
    const memberships = await prisma.departmentMember.findMany({
      where: { userId: user.id, role: 'admin', department: { orgId } },
      select: { departmentId: true },
    });
    permittedDepartments = memberships.map((m) => m.departmentId);
    if (!permittedDepartments.length) return deny('Forbidden', 403);
    if (requestedDepartment && !permittedDepartments.includes(requestedDepartment)) return deny('Forbidden', 403);
  } else if (requestedDepartment) {
    const exists = await prisma.department.findFirst({ where: { id: requestedDepartment, orgId }, select: { id: true } });
    if (!exists) return deny('Department not found', 404);
  }
  const departmentKeys = requestedDepartment ? [requestedDepartment] : permittedDepartments ?? ['all'];

  const today = new Date(); today.setUTCHours(0, 0, 0, 0);
  const since = new Date(today.getTime() - (days - 1) * DAY_MS);
  const dates = Array.from({ length: days }, (_, i) => new Date(since.getTime() + i * DAY_MS).toISOString().slice(0, 10));

  try {
    // 1. Daily series: stored roll-up rows, live for days without them.
    const stored = await prisma.analyticsDaily.findMany({
      where: { orgId, sourceSystem: 'all', date: { gte: since, lt: today }, metric: { in: STORED_METRICS } },
      select: { date: true, metric: true, departmentKey: true, value: true, dims: true },
    });
    const storedByDate = new Map();
    for (const row of stored) {
      const date = row.date.toISOString().slice(0, 10);
      if (!storedByDate.has(date)) storedByDate.set(date, {});
      const groups = storedByDate.get(date);
      if (!groups[row.departmentKey]) groups[row.departmentKey] = { total: {}, byRole: {} };
      const group = groups[row.departmentKey];
      group.total[row.metric] = row.value;
      for (const [r, v] of Object.entries(row.dims?.byRole || {})) {
        if (!group.byRole[r]) group.byRole[r] = {};
        group.byRole[r][row.metric] = v;
      }
    }
    let liveDays = 0;
    const daily = [];
    for (const date of dates) {
      // A rolled-up day always has an "all" group; departments without
      // activity that day have no rows and count as zero.
      let groups = storedByDate.get(date);
      if (!groups?.all) { groups = await computeUsageDayGroups(prisma, { orgId, date }); liveDays++; }
      const picked = departmentKeys.map((key) => pickMetrics(groups[key], requestedRole)).filter(Boolean);
      daily.push({ date, ...withRates(sumMetrics(picked)) });
    }
    const totals = withRates(sumMetrics(daily));

    // 2. Period aggregates in SQL.
    const filters = [Prisma.sql`e.org_id = ${orgId}`, Prisma.sql`e.created_at >= ${since}`];
    if (requestedDepartment) filters.push(Prisma.sql`e.department_id = ${requestedDepartment}`);
    else if (permittedDepartments) filters.push(Prisma.sql`e.department_id IN (${Prisma.join(permittedDepartments)})`);
    if (requestedRole) filters.push(Prisma.sql`e.role = ${requestedRole}`);
    const where = Prisma.join(filters, ' AND ');

    const [period] = await prisma.$queryRaw`
      WITH ev AS (SELECT e.id, e.user_id, e.kind, e.created_at, e.latency_ms, e.first_token_ms FROM "SearchEvent" e WHERE ${where}),
      tta AS (
        SELECT CASE WHEN ev.kind = 'chat' THEN ev.first_token_ms::float8
               ELSE EXTRACT(EPOCH FROM (MIN(c.clicked_at) - ev.created_at)) * 1000 END AS ms
        FROM ev LEFT JOIN "SearchClick" c ON c.search_event_id = ev.id AND ev.kind <> 'chat'
        GROUP BY ev.id, ev.kind, ev.first_token_ms, ev.created_at
      )
      SELECT
        (SELECT COUNT(DISTINCT user_id)::int FROM ev) AS active_users,
        (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY latency_ms) FROM ev WHERE latency_ms IS NOT NULL AND kind <> 'chat') AS p50_search_ms,
        (SELECT percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms) FROM ev WHERE latency_ms IS NOT NULL AND kind <> 'chat') AS p95_search_ms,
        (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY first_token_ms) FROM ev WHERE first_token_ms IS NOT NULL AND kind = 'chat') AS p50_answer_ms,
        (SELECT percentile_cont(0.95) WITHIN GROUP (ORDER BY first_token_ms) FROM ev WHERE first_token_ms IS NOT NULL AND kind = 'chat') AS p95_answer_ms,
        (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY ms) FROM tta WHERE ms >= 0) AS p50_tta_ms,
        (SELECT percentile_cont(0.95) WITHIN GROUP (ORDER BY ms) FROM tta WHERE ms >= 0) AS p95_tta_ms`;

    const breakdown = await prisma.$queryRaw`
      SELECT e.department_id, COALESCE(e.role, 'unknown') AS role,
        COUNT(*) FILTER (WHERE e.kind <> 'chat')::int AS searches,
        COUNT(*) FILTER (WHERE e.kind = 'chat')::int AS questions,
        COUNT(DISTINCT e.user_id)::int AS active_users,
        COUNT(*) FILTER (WHERE e.kind <> 'chat' AND EXISTS (SELECT 1 FROM "SearchClick" c WHERE c.search_event_id = e.id))::int AS clicked_searches
      FROM "SearchEvent" e WHERE ${where}
      GROUP BY e.department_id, COALESCE(e.role, 'unknown')
      ORDER BY COUNT(*) DESC
      LIMIT 200`;

    const topQueries = await prisma.$queryRaw`
      SELECT e.normalized_query AS query, COUNT(*)::int AS count
      FROM "SearchEvent" e WHERE ${where}
      GROUP BY e.normalized_query ORDER BY count DESC, query ASC LIMIT 10`;

    if (url.searchParams.get('format') === 'csv') {
      const csv = usageCsv(daily.map((d) => ({ ...d, ctr: round1(d.ctr * 100), bounceRate: round1(d.bounceRate * 100) })));
      const name = `kms-usage-${dates[0]}-to-${dates[dates.length - 1]}.csv`;
      return new Response(csv, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${name}"`, 'Cache-Control': 'no-store' } });
    }

    return NextResponse.json({
      filters: {
        days, departmentId: requestedDepartment, role: requestedRole,
        scope: permittedDepartments ? 'managed_departments' : 'organization',
        permittedDepartmentIds: permittedDepartments,
      },
      summary: {
        searches: totals.searches,
        questions: totals.questions,
        activeUsers: period?.active_users ?? 0,
        ctr: totals.ctr,
        bounceRate: totals.bounceRate,
        avgTimeToAnswerMs: totals.avgTimeToAnswerMs,
        p50TimeToAnswerMs: round1(period?.p50_tta_ms),
      },
      performance: {
        p50SearchMs: round1(period?.p50_search_ms), p95SearchMs: round1(period?.p95_search_ms),
        p50AnswerMs: round1(period?.p50_answer_ms), p95AnswerMs: round1(period?.p95_answer_ms),
        p95TimeToAnswerMs: round1(period?.p95_tta_ms),
      },
      daily,
      breakdown: breakdown.map((r) => ({
        departmentId: r.department_id, role: r.role, searches: r.searches, questions: r.questions,
        activeUsers: r.active_users, ctr: r.searches ? r.clicked_searches / r.searches : 0,
      })),
      topQueries,
      liveDays,
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Usage analytics failed:', error?.message);
    return deny('Unable to load usage analytics', 500);
  }
}
