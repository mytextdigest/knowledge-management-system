import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { resolveOrgRole } from '@/lib/orgGuard';
import { AUDIT_EVENTS } from '@/lib/audit/events';

// B-15: turn a workflow definition on or off (super admin). Off means it no
// longer gates publishing/decommissioning and can't be chosen for new
// submissions; workflows already running finish on it.
const fail = (error, status) => NextResponse.json({ error }, { status });

export async function PATCH(request, { params }) {
  const { orgId, definitionId } = await params;
  const session = await getServerSession();
  if (!session?.user?.email) return fail('Unauthorized', 401);
  const { user, role } = await resolveOrgRole(session.user.email, orgId);
  if (!user || role !== 'super_admin') return fail('Forbidden', 403);
  let body;
  try { body = await request.json(); } catch { return fail('Invalid JSON', 400); }
  if (typeof body?.active !== 'boolean') return fail('active must be true or false', 400);
  const current = await prisma.workflowDefinition.findFirst({ where: { id: definitionId, orgId }, select: { id: true, active: true } });
  if (!current) return fail('Not found', 404);
  if (current.active === body.active) return NextResponse.json(current);
  const item = await prisma.$transaction(async (tx) => {
    const item = await tx.workflowDefinition.update({ where: { id: definitionId }, data: { active: body.active }, select: { id: true, active: true } });
    await tx.auditLog.create({ data: {
      orgId, actorUserId: user.id, action: AUDIT_EVENTS.WORKFLOW_DEFINITION_CHANGED, entityType: 'workflow_definition', entityId: definitionId,
      before: { active: current.active }, after: { active: body.active },
    } });
    return item;
  });
  return NextResponse.json(item);
}
