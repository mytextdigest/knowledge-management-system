import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { resolveOrgRole } from '@/lib/orgGuard';
import { validateReviewPolicy } from '@/lib/governance/reviewCycles.mjs';
import { AUDIT_EVENTS } from '@/lib/audit/events';

// B-18 (E25): edit a review policy or turn it on/off (super admin). Open
// reviews already created keep their reviewer and due date; the change
// applies from the next review scan.
const fail = (error, status) => NextResponse.json({ error }, { status });
const FIELDS = ['name', 'intervalDays', 'reviewerType', 'escalateAfterDays', 'departmentIds', 'categories'];

export async function PATCH(req, { params }) {
  const { orgId, policyId } = await params;
  const session = await getServerSession();
  if (!session?.user?.email) return fail('Unauthorized', 401);
  const { user, role } = await resolveOrgRole(session.user.email, orgId);
  if (!user || role !== 'super_admin') return fail('Forbidden', 403);
  let body;
  try { body = await req.json(); } catch { return fail('Invalid JSON', 400); }
  const current = await prisma.reviewPolicy.findFirst({ where: { id: policyId, orgId } });
  if (!current) return fail('Not found', 404);

  const next = { ...current };
  for (const key of FIELDS) if (body?.[key] !== undefined) next[key] = key === 'name' && typeof body.name === 'string' ? body.name.trim() : body[key];
  if (body?.active !== undefined) {
    if (typeof body.active !== 'boolean') return fail('active must be true or false', 400);
    next.active = body.active;
  }
  const issue = validateReviewPolicy(next);
  if (issue) return fail(issue, 400);
  if (next.departmentIds.length) {
    const found = await prisma.department.count({ where: { orgId, id: { in: next.departmentIds } } });
    if (found !== new Set(next.departmentIds).size) return fail('Unknown department', 400);
  }

  const changed = Object.fromEntries([...FIELDS, 'active'].filter((k) => JSON.stringify(next[k]) !== JSON.stringify(current[k])).map((k) => [k, next[k]]));
  if (!Object.keys(changed).length) return NextResponse.json(current);
  try {
    const item = await prisma.$transaction(async (tx) => {
      const item = await tx.reviewPolicy.update({ where: { id: current.id }, data: changed });
      await tx.auditLog.create({ data: {
        orgId, actorUserId: user.id, action: AUDIT_EVENTS.REVIEW_POLICY_CHANGED, entityType: 'review_policy', entityId: item.id,
        before: Object.fromEntries(Object.keys(changed).map((k) => [k, current[k]])), after: changed,
      } });
      return item;
    });
    return NextResponse.json(item);
  } catch (e) {
    if (e.code === 'P2002') return fail('Policy name exists', 409);
    console.error('Review policy update failed', e);
    return fail('Could not update policy', 500);
  }
}
