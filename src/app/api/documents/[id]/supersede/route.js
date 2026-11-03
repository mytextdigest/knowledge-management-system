import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { resolveOrgRole, canManageDepartment } from '@/lib/orgGuard';
import { AUDIT_EVENTS } from '@/lib/audit/events';
import { validateSupersession } from '@/lib/lifecycle/supersede.mjs';

const selectDoc = { id: true, orgId: true, scope: true, departmentId: true, lifecycle: true, supersededById: true };

// Who may supersede: a super admin, or an admin of the document's department.
async function authorize(email, source) {
  const { user, role } = await resolveOrgRole(email, source.orgId);
  if (!user || !['super_admin', 'dept_admin'].includes(role)) return null;
  if (role === 'dept_admin' && (!source.departmentId ||
      !(await canManageDepartment(role, source.departmentId, user.id)))) return null;
  return user;
}

// GET ?q= : documents that can replace this one (same department, published,
// not themselves superseded), for the "Mark as replaced" picker.
export async function GET(req, { params }) {
  const session = await getServerSession();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const source = await prisma.document.findFirst({ where: { id, deletedAt: null }, select: selectDoc });
  if (!source || !source.orgId || source.scope !== 'repository')
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!(await authorize(session.user.email, source))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const q = new URL(req.url).searchParams.get('q')?.trim().slice(0, 200);
  const items = await prisma.document.findMany({
    where: {
      orgId: source.orgId, scope: 'repository', departmentId: source.departmentId, lifecycle: 'published',
      supersededById: null, deletedAt: null, id: { not: id },
      ...(q ? { filename: { contains: q, mode: 'insensitive' } } : {}),
    },
    select: { id: true, filename: true, createdAt: true },
    orderBy: { createdAt: 'desc' }, take: 25,
  });
  return NextResponse.json({ items });
}

export async function POST(req, { params }) {
  const session = await getServerSession();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  let body;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  const successorId = body?.byDocumentId ?? body?.successorDocumentId;
  if (typeof successorId !== 'string' || !successorId.trim())
    return NextResponse.json({ error: 'successorDocumentId is required' }, { status: 400 });

  const source = await prisma.document.findUnique({ where: { id }, select: selectDoc });
  if (!source || !source.orgId || source.scope !== 'repository')
    return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const user = await authorize(session.user.email, source);
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const successor = await prisma.document.findUnique({ where: { id: successorId }, select: selectDoc });
  const issue = validateSupersession(source, successor);
  if (issue) return NextResponse.json({ error: issue }, { status: 400 });

  try {
    const result = await prisma.$transaction(async (tx) => {
      // A concurrent supersession cannot silently overwrite the first successor.
      const changed = await tx.document.updateMany({
        where: { id, lifecycle: 'published', supersededById: null },
        data: { lifecycle: 'superseded', supersededById: successorId },
      });
      if (changed.count !== 1) throw new Error('CONFLICT');
      // Revalidate successor inside the transaction before committing.
      const stillValid = await tx.document.findFirst({
        where: { id: successorId, orgId: source.orgId, scope: 'repository',
          departmentId: source.departmentId, lifecycle: 'published', supersededById: null },
        select: { id: true },
      });
      if (!stillValid) throw new Error('CONFLICT');
      await tx.auditLog.create({ data: {
        orgId: source.orgId, actorUserId: user.id,
        action: AUDIT_EVENTS.DOCUMENT_SUPERSEDED,
        entityType: 'document', entityId: id,
        before: { lifecycle: source.lifecycle },
        after: { lifecycle: 'superseded', supersededById: successorId },
      } });
      return { id, lifecycle: 'superseded', supersededById: successorId };
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error.message === 'CONFLICT')
      return NextResponse.json({ error: 'Document state changed; refresh and retry' }, { status: 409 });
    console.error('Document supersession failed:', error?.message);
    return NextResponse.json({ error: 'Could not supersede document' }, { status: 500 });
  }
}
