import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { resolveOrgRole } from '@/lib/orgGuard';
import { AUDIT_EVENTS } from '@/lib/audit/events';
import { validateScope } from '@/lib/workflows/engine.mjs';

// B-15: turn a workflow definition on or off (super admin). Off means it no
// longer gates publishing/decommissioning and can't be chosen for new
// submissions; workflows already running finish on it.
// E22.3: also change which departments/categories it covers (empty = all).
// PATCH { active?, departmentIds?, categories? }
const fail = (error, status) => NextResponse.json({ error }, { status });

export async function PATCH(request, { params }) {
  const { orgId, definitionId } = await params;
  const session = await getServerSession();
  if (!session?.user?.email) return fail('Unauthorized', 401);
  const { user, role } = await resolveOrgRole(session.user.email, orgId);
  if (!user || role !== 'super_admin') return fail('Forbidden', 403);
  let body;
  try { body = await request.json(); } catch { return fail('Invalid JSON', 400); }
  const data = {};
  if (body?.active !== undefined) {
    if (typeof body.active !== 'boolean') return fail('active must be true or false', 400);
    data.active = body.active;
  }
  const scopeIssue = validateScope(body || {});
  if (scopeIssue) return fail(scopeIssue, 400);
  if (body.departmentIds) data.departmentIds = [...new Set(body.departmentIds)];
  if (body.categories) data.categories = [...new Set(body.categories.map((c) => c.trim()))];
  if (!Object.keys(data).length) return fail('Nothing to change', 400);
  if (data.departmentIds?.length && (await prisma.department.count({ where: { orgId, id: { in: data.departmentIds } } })) !== data.departmentIds.length) {
    return fail('Unknown department', 400);
  }
  const SELECT = { id: true, active: true, departmentIds: true, categories: true };
  const current = await prisma.workflowDefinition.findFirst({ where: { id: definitionId, orgId }, select: SELECT });
  if (!current) return fail('Not found', 404);
  const item = await prisma.$transaction(async (tx) => {
    const item = await tx.workflowDefinition.update({ where: { id: definitionId }, data, select: SELECT });
    const before = Object.fromEntries(Object.keys(data).map((k) => [k, current[k]]));
    await tx.auditLog.create({ data: {
      orgId, actorUserId: user.id, action: AUDIT_EVENTS.WORKFLOW_DEFINITION_CHANGED, entityType: 'workflow_definition', entityId: definitionId,
      before, after: data,
    } });
    return item;
  });
  return NextResponse.json(item);
}
