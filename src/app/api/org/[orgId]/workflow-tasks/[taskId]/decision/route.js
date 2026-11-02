import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { resolveOrgRole } from '@/lib/orgGuard';
import { decide, validateDecommissionTarget } from '@/lib/workflows/engine.mjs';
import { validateTaskDecision } from '@/lib/workflows/taskInbox.mjs';
import { resolveStageAssignee, moveLifecycle } from '@/lib/workflows/publishFlow';
import { publishingCompleteness, PUBLISH_SELECT } from '@/lib/governance/publishGate';
import { AUDIT_EVENTS } from '@/lib/audit/events';
import { notify } from '@/lib/notifications/notify';

// B-15 (E22): a reviewer's decision on their task.
//   approve, not the last stage -> next stage's task (never the submitter)
//   approve, last stage         -> publish: in_review -> published (completeness re-checked)
//                                  decommission: the requested archive/retire
//   reject / request_changes    -> publish: in_review -> draft
const fail = (error, status, extra = {}) => NextResponse.json({ error, ...extra }, { status });

export async function POST(request, { params }) {
  const { orgId, taskId } = await params;
  const session = await getServerSession();
  if (!session?.user?.email) return fail('Unauthorized', 401);
  const { user, role } = await resolveOrgRole(session.user.email, orgId);
  if (!user || !role) return fail('Forbidden', 403);
  let body;
  try { body = await request.json(); } catch { return fail('Invalid JSON', 400); }
  const validationError = validateTaskDecision(body?.action, body?.comment);
  if (validationError) return fail(validationError, 400);

  try {
    const result = await prisma.$transaction(async (tx) => {
      const task = await tx.workflowTask.findFirst({
        where: { id: taskId, instance: { orgId } },
        include: { instance: { include: { definition: { include: { stages: { orderBy: { position: 'asc' } } } } } } },
      });
      if (!task) throw new Error('NOT_FOUND');
      const instance = task.instance;
      const kind = instance.definition.kind;
      const transition = decide({
        actorId: user.id, submittedById: instance.submittedById, assigneeId: task.assigneeId,
        status: instance.status, taskStatus: task.status, action: body.action,
        position: instance.currentPosition, totalStages: instance.definition.stages.length,
      });
      if (transition.error) throw new Error('INVALID_TRANSITION');
      if (task.stageId !== instance.definition.stages[instance.currentPosition - 1]?.id) throw new Error('INVALID_TRANSITION');

      const doc = await tx.document.findFirst({
        where: { id: instance.documentId, orgId, scope: 'repository', deletedAt: null },
        select: PUBLISH_SELECT,
      });
      if (!doc) throw new Error('DOCUMENT_GONE');

      const claim = await tx.workflowTask.updateMany({
        where: { id: task.id, status: 'pending', assigneeId: user.id },
        data: { status: transition.taskStatus, decidedAt: new Date() },
      });
      if (claim.count !== 1) throw new Error('CONFLICT');
      const updated = await tx.workflowInstance.updateMany({
        where: { id: instance.id, status: 'in_review', currentPosition: instance.currentPosition },
        data: { status: transition.instanceStatus, currentPosition: transition.nextPosition },
      });
      if (updated.count !== 1) throw new Error('CONFLICT');
      await tx.workflowDecision.create({
        data: { instanceId: instance.id, taskId: task.id, actorId: user.id, action: body.action, comment: body.comment?.trim() || null },
      });

      let nextAssigneeId = null;
      if (transition.instanceStatus === 'in_review') {
        const next = instance.definition.stages[transition.nextPosition - 1];
        nextAssigneeId = await resolveStageAssignee(tx, {
          orgId, stage: next, submittedById: instance.submittedById, departmentId: doc.departmentId,
        });
        if (!nextAssigneeId) throw new Error('NO_APPROVER');
        await tx.workflowTask.create({ data: { instanceId: instance.id, stageId: next.id, assigneeId: nextAssigneeId } });
      }

      let published = false;
      if (kind === 'publish') {
        if (transition.instanceStatus === 'approved') {
          const completeness = await publishingCompleteness(doc);
          if (!completeness.complete) { const e = new Error('INCOMPLETE'); e.completeness = completeness; throw e; }
          if (!(await moveLifecycle(tx, { documentId: doc.id, orgId, from: 'in_review', to: 'published' }))) throw new Error('CONFLICT');
          await tx.auditLog.create({ data: {
            orgId, actorUserId: user.id, action: AUDIT_EVENTS.DOCUMENT_PUBLISHED, entityType: 'document', entityId: doc.id,
            before: { lifecycle: 'in_review' }, after: { lifecycle: 'published' },
            metadata: { workflowInstanceId: instance.id },
          } });
          published = true;
        } else if (transition.instanceStatus === 'rejected' || transition.instanceStatus === 'changes_requested') {
          if (!(await moveLifecycle(tx, { documentId: doc.id, orgId, from: 'in_review', to: 'draft' }))) throw new Error('CONFLICT');
        }
      }

      if (transition.instanceStatus === 'approved' && kind === 'decommission') {
        if (!validateDecommissionTarget(doc.lifecycle, instance.targetLifecycle)) throw new Error('DECOMMISSION_CONFLICT');
        if (!(await moveLifecycle(tx, { documentId: doc.id, orgId, from: doc.lifecycle, to: instance.targetLifecycle }))) throw new Error('DECOMMISSION_CONFLICT');
        await tx.auditLog.create({ data: {
          orgId, actorUserId: user.id,
          action: instance.targetLifecycle === 'archived' ? AUDIT_EVENTS.DOCUMENT_ARCHIVED : AUDIT_EVENTS.DOCUMENT_RETIRED,
          entityType: 'document', entityId: doc.id,
          before: { lifecycle: doc.lifecycle }, after: { lifecycle: instance.targetLifecycle },
          metadata: { workflowInstanceId: instance.id, approvedBy: user.id },
        } });
      }

      const action = body.action === 'approve' ? AUDIT_EVENTS.WORKFLOW_APPROVED
        : body.action === 'reject' ? AUDIT_EVENTS.WORKFLOW_REJECTED : AUDIT_EVENTS.WORKFLOW_CHANGES_REQUESTED;
      await tx.auditLog.create({ data: {
        orgId, actorUserId: user.id, action, entityType: 'document', entityId: instance.documentId,
        metadata: { workflowInstanceId: instance.id, taskId, stage: instance.currentPosition, kind },
      } });
      return { status: transition.instanceStatus, nextAssigneeId, submitterId: instance.submittedById, documentId: instance.documentId, published };
    }, { isolationLevel: 'Serializable' });

    const link = `/document?id=${encodeURIComponent(result.documentId)}`;
    if (result.nextAssigneeId) {
      await notify({ orgId, userIds: [result.nextAssigneeId], type: 'workflow.task_assigned', title: 'Document review assigned', body: 'A document is awaiting your review.', link });
    } else {
      const outcome = result.published ? 'approved and published'
        : result.status === 'changes_requested' ? 'returned with requested changes' : result.status.replaceAll('_', ' ');
      await notify({ orgId, userIds: [result.submitterId], type: 'workflow.decided', title: 'Document workflow updated', body: `Your submission was ${outcome}.`, link });
    }
    return NextResponse.json({ status: result.status, published: result.published });
  } catch (error) {
    if (error.message === 'NOT_FOUND') return fail('Not found', 404);
    if (error.message === 'DOCUMENT_GONE') return fail('The document no longer exists', 404);
    if (error.message === 'INVALID_TRANSITION') return fail('Task is not pending or not assigned to you', 403);
    if (error.message === 'INCOMPLETE') return fail('Required metadata incomplete; complete it before the final approval', 422, { completeness: error.completeness });
    if (error.message === 'NO_APPROVER') return fail('Nobody other than the submitter can approve the next stage', 409);
    if (['CONFLICT', 'DECOMMISSION_CONFLICT'].includes(error.message) || error.code === 'P2034' || error.code === 'P2002') return fail('Workflow changed; reload and retry', 409);
    console.error('Workflow decision failed', error);
    return fail('Unable to record decision', 500);
  }
}
