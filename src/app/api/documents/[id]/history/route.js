import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { resolveOrgRole } from '@/lib/orgGuard';
import { canViewDocument } from '@/lib/access/documentAccess';
import { parseAuditFilters, auditWhere } from '@/lib/audit/filters.mjs';

const PAGE_SIZE = 25;
export async function GET(req, { params }) {
  const session = await getServerSession();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const doc = await prisma.document.findUnique({ where: { id }, select: {
    id: true, orgId: true, userId: true, departmentId: true, lifecycle: true, scope: true,
    project: { select: { orgId: true, departmentId: true, scope: true } },
  } });
  if (!doc) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const orgId = doc.orgId || doc.project?.orgId;
  if (!orgId) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const { user, role } = await resolveOrgRole(session.user.email, orgId);
  if (!user || !role) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const canAccess = doc.userId === user.id || await canViewDocument(doc, { userId: user.id, role });
  if (!canAccess) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  let filters, where;
  try {
    filters = parseAuditFilters(new URL(req.url).searchParams);
    where = auditWhere(orgId, { ...filters, entityType: 'document', entityId: id });
  } catch (err) { return NextResponse.json({ error: err.message }, { status: 400 }); }
  const [rows, total] = await Promise.all([
    prisma.auditLog.findMany({ where, select: {
      id: true, action: true, createdAt: true, actor: { select: { name: true, email: true } },
    }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (filters.page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
    prisma.auditLog.count({ where }),
  ]);
  return NextResponse.json({ entries: rows, total, page: filters.page, pageSize: PAGE_SIZE, totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)) });
}
