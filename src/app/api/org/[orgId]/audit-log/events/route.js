import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { resolveOrgRole, isSuperAdmin } from '@/lib/orgGuard';
import { parseAuditFilters, auditWhere } from '@/lib/audit/filters.mjs';

const PAGE_SIZE = 25;
export async function GET(req, { params }) {
  const session = await getServerSession();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { orgId } = await params;
  const { user, role } = await resolveOrgRole(session.user.email, orgId);
  if (!user || !isSuperAdmin(role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  let filters, where;
  try {
    filters = parseAuditFilters(new URL(req.url).searchParams);
    where = auditWhere(orgId, filters);
  } catch (err) { return NextResponse.json({ error: err.message }, { status: 400 }); }
  const [rows, total] = await Promise.all([
    prisma.auditLog.findMany({ where, select: {
      id: true, action: true, entityType: true, entityId: true, createdAt: true,
      actor: { select: { name: true, email: true } },
    }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (filters.page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
    prisma.auditLog.count({ where }),
  ]);
  return NextResponse.json({ entries: rows, total, page: filters.page, pageSize: PAGE_SIZE, totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)) });
}
