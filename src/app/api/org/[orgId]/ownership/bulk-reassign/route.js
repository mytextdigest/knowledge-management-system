import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { resolveOrgRole, canManageDepartment } from '@/lib/orgGuard';
import { AUDIT_EVENTS } from '@/lib/audit/events';
import { redactAuditValue } from '@/lib/audit/redact.mjs';
import { notify } from '@/lib/notifications/notify';

const fail = (error, status) => NextResponse.json({ error }, { status });
const LIMIT = 100;

// B-10: bounded reassignment; no implicit cross-department privileges.
export async function POST(req, { params }) {
  const session = await getServerSession();
  if (!session?.user?.email) return fail('Unauthorized', 401);
  const { orgId } = await params;
  const { user, role } = await resolveOrgRole(session.user.email, orgId);
  if (!user || !role) return fail('Forbidden', 403);
  let body;
  try { body = await req.json(); } catch { return fail('Invalid JSON', 400); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return fail('Invalid body', 400);
  const { fromUserId, toUserId, departmentId } = body;
  if (typeof fromUserId !== 'string' || !fromUserId.trim() ||
      typeof toUserId !== 'string' || !toUserId.trim() || fromUserId === toUserId ||
      (departmentId !== undefined && (typeof departmentId !== 'string' || !departmentId.trim())))
    return fail('Valid, distinct fromUserId and toUserId required', 400);
  if (role !== 'super_admin') {
    if (role !== 'dept_admin' || !departmentId ||
        !(await canManageDepartment(role, departmentId, user.id))) return fail('Forbidden', 403);
  }
  try {
    const result = await prisma.$transaction(async (tx) => {
      const actor = await tx.organizationMember.findUnique({
        where: { orgId_userId: { orgId, userId: user.id } }, select: { role: true },
      });
      if (actor?.role !== 'super_admin') {
        if (actor?.role !== 'dept_admin' || !departmentId) throw new Error('FORBIDDEN');
        const deptAdmin = await tx.departmentMember.findUnique({
          where: { departmentId_userId: { departmentId, userId: user.id } }, select: { role: true },
        });
        if (deptAdmin?.role !== 'admin') throw new Error('FORBIDDEN');
      }
      const sourceMember = await tx.organizationMember.findUnique({
        where: { orgId_userId: { orgId, userId: fromUserId } }, select: { userId: true },
      });
      if (!sourceMember) throw new Error('INVALID_SOURCE');
      const member = await tx.organizationMember.findUnique({
        where: { orgId_userId: { orgId, userId: toUserId } }, select: { userId: true },
      });
      if (!member) throw new Error('INVALID_TARGET');
      if (departmentId) {
        const dept = await tx.department.findFirst({ where: { id: departmentId, orgId }, select: { id: true } });
        if (!dept) throw new Error('INVALID_DEPARTMENT');
      }
      const where = { orgId, scope: 'repository', deletedAt: null, ownerId: fromUserId,
        ...(departmentId ? { departmentId } : {}) };
      const docs = await tx.document.findMany({ where, select: { id: true, ownerId: true },
        orderBy: { id: 'asc' }, take: LIMIT + 1 });
      if (docs.length > LIMIT) throw new Error('TOO_MANY');
      for (const doc of docs) {
        const update = await tx.document.updateMany({
          where: { id: doc.id, ...where }, data: { ownerId: toUserId },
        });
        if (update.count !== 1) throw new Error('CONFLICT');
        await tx.auditLog.create({ data: {
          orgId, actorUserId: user.id, action: AUDIT_EVENTS.DOCUMENT_OWNER_CHANGED,
          entityType: 'document', entityId: doc.id,
          before: redactAuditValue({ ownerId: fromUserId }),
          after: redactAuditValue({ ownerId: toUserId, bulk: true }),
        } });
      }
      return { reassigned: docs.length, documentIds: docs.map((d) => d.id) };
    }, { isolationLevel: 'Serializable', maxWait: 5000, timeout: 15000 });
    // Never notify inside the transaction; failed delivery must not undo ownership.
    if (result.reassigned > 0) {
      await notify({
        orgId, userIds: [toUserId], type: 'ownership.assigned',
        title: 'Documents assigned to you',
        body: `You have been assigned ownership of ${result.reassigned} document(s).`,
        link: `/org/${encodeURIComponent(orgId)}/repository`,
      });
    }
    return NextResponse.json(result);
  } catch (error) {
    if (error?.message === 'FORBIDDEN') return fail('Forbidden', 403);
    if (error?.message === 'INVALID_SOURCE') return fail('Source must be an organization member', 400);
    if (error?.message === 'INVALID_TARGET') return fail('Target must be an organization member', 400);
    if (error?.message === 'INVALID_DEPARTMENT') return fail('Department not found in organization', 400);
    if (error?.message === 'TOO_MANY') return fail('More than 100 matching documents; narrow by department', 409);
    if (error?.message === 'CONFLICT' || error?.code === 'P2034') return fail('Concurrent change; retry', 409);
    console.error('Bulk ownership reassignment failed:', error?.message);
    return fail('Unable to reassign documents', 500);
  }
}
