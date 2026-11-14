import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { resolveOrgRole } from '@/lib/orgGuard';

const deny = (error, status) => NextResponse.json({ error }, { status, headers: { 'Cache-Control': 'no-store' } });
const round = (n) => Math.round(n * 10) / 10;

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
  const since = new Date(Date.now() - days * 86400000);

  // Department administrators may inspect only departments where they are an admin.
  // Unassigned/organization-wide events are excluded from department-level reporting.
  let permittedDepartments = null;
  if (role === 'dept_admin') {
    const memberships = await prisma.departmentMember.findMany({
      where: { userId: user.id, role: 'admin', department: { orgId } },
      select: { departmentId: true },
    });
    permittedDepartments = memberships.map((m) => m.departmentId);
    if (!permittedDepartments.length) return deny('Forbidden', 403);
    if (requestedDepartment && !permittedDepartments.includes(requestedDepartment)) return deny('Forbidden', 403);
  }
  const where = {
    orgId,
    createdAt: { gte: since },
    ...(requestedDepartment ? { departmentId: requestedDepartment } :
      permittedDepartments ? { departmentId: { in: permittedDepartments } } : {}),
  };
  try {
    // Aggregate in SQL rather than downloading unbounded search history.
    const [total, noResults, grouped, recent, latencies, clicks, reformulations] = await Promise.all([
      prisma.searchEvent.count({ where }),
      prisma.searchEvent.count({ where: { ...where, resultCount: 0 } }),
      prisma.searchEvent.groupBy({ by: ['normalizedQuery'], where, _count: { _all: true }, orderBy: { _count: { normalizedQuery: 'desc' } }, take: 10 }),
      prisma.searchEvent.findMany({ where, orderBy: { createdAt: 'desc' }, take: 30, select: { id: true, kind: true, normalizedQuery: true, resultCount: true, latencyMs: true, createdAt: true, departmentId: true } }),
      prisma.searchEvent.aggregate({ where: { ...where, latencyMs: { not: null } }, _avg: { latencyMs: true } }),
      prisma.searchClick.count({ where: { searchEvent: where } }),
      prisma.searchEvent.count({ where: { ...where, previousEventId: { not: null } } }),
    ]);
    const topQueries = grouped.map((r) => ({ query: r.normalizedQuery, count: r._count._all }));
    const noResultQueries = await prisma.searchEvent.groupBy({
      by: ['normalizedQuery'], where: { ...where, resultCount: 0 },
      _count: { _all: true }, orderBy: { _count: { normalizedQuery: 'desc' } }, take: 10,
    });
    return NextResponse.json({
      filters: { days, departmentId: requestedDepartment, scope: role === 'super_admin' ? 'organization' : 'managed_departments', permittedDepartmentIds: permittedDepartments },
      summary: { total, noResults, noResultRate: total ? round(100 * noResults / total) : 0, averageLatencyMs: latencies._avg.latencyMs === null ? null : round(latencies._avg.latencyMs), clicks, reformulations },
      topQueries,
      noResultQueries: noResultQueries.map((r) => ({ query: r.normalizedQuery, count: r._count._all })),
      recent,
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Search analytics failed:', error?.message);
    return deny('Unable to load search analytics', 500);
  }
}
