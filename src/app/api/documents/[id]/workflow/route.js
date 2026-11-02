import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { resolveOrgRole } from '@/lib/orgGuard';
import { AUDIT_EVENTS } from '@/lib/audit/events';
import { notify } from '@/lib/notifications/notify';
import { validateDecommissionTarget } from '@/lib/workflows/engine.mjs';
import { activeDefinitions, choosePublishDefinition, startWorkflowInstance, moveLifecycle } from '@/lib/workflows/publishFlow';
import { publishingCompleteness, PUBLISH_SELECT } from '@/lib/governance/publishGate';

// B-15/B-16 (E22, E23.6): a document's approval workflows.
//   GET    timeline (instances, tasks, decisions) + what the viewer may do
//   POST   submit { definitionId?, targetLifecycle? }   publish: draft -> in_review
//   DELETE withdraw the running workflow (submitter or super admin)  publish: in_review -> draft
const fail = (error, status, extra = {}) => NextResponse.json({ error, ...extra }, { status });
const PERSON = { select: { id: true, name: true, email: true } };

async function access(id) {
  const session = await getServerSession();
  if (!session?.user?.email) return { error: fail('Unauthorized', 401) };
  const doc = await prisma.document.findFirst({
    where: { id, scope: 'repository', deletedAt: null },
    select: { id: true, orgId: true, userId: true, ownerId: true, lifecycle: true, departmentId: true },
  });
  if (!doc?.orgId) return { error: fail('Not found', 404) };
  const { user, role } = await resolveOrgRole(session.user.email, doc.orgId);
  if (!user || !role) return { error: fail('Forbidden', 403) };
  return { doc, user, role };
}

const isSubmitter = ({ doc, user, role }) =>
  role !== 'guest' && (role === 'super_admin' || doc.userId === user.id || doc.ownerId === user.id);

export async function GET(_request, { params }) {
  const { id } = await params;
  const auth = await access(id);
  if (auth.error) return auth.error;
  const { doc, user, role } = auth;
  if (!isSubmitter(auth) && role !== 'dept_admin') {
    const assigned = await prisma.workflowTask.findFirst({
      where: { assigneeId: user.id, instance: { documentId: id, orgId: doc.orgId } }, select: { id: true },
    });
    if (!assigned) return fail('Forbidden', 403);
  }
  const [items, publishDefs, decommissionDefs] = await Promise.all([
    prisma.workflowInstance.findMany({
      where: { documentId: id, orgId: doc.orgId },
      include: {
        definition: { select: { name: true, kind: true } },
        submittedBy: PERSON,
        tasks: { include: { stage: { select: { name: true, position: true } }, assignee: PERSON }, orderBy: { createdAt: 'asc' } },
        decisions: { include: { actor: PERSON }, orderBy: { createdAt: 'asc' } },
      },
      orderBy: { createdAt: 'desc' }, take: 30,
    }),
    activeDefinitions(prisma, doc.orgId, 'publish'),
    activeDefinitions(prisma, doc.orgId, 'decommission'),
  ]);
  const active = items.find((w) => w.status === 'in_review') || null;
  const myTask = active?.tasks.find((t) => t.status === 'pending' && t.assigneeId === user.id) || null;
  const summarize = (d) => ({ id: d.id, name: d.name, kind: d.kind, stages: d.stages.length });
  return NextResponse.json({
    items,
    lifecycle: doc.lifecycle,
    definitions: [...publishDefs, ...decommissionDefs].map(summarize),
    viewer: {
      canSubmit: !active && isSubmitter(auth),
      canWithdraw: Boolean(active) && (role === 'super_admin' || active.submittedById === user.id),
      myTaskId: myTask?.id ?? null,
    },
  });
}

export async function POST(request, { params }) {
  const { id } = await params;
  const auth = await access(id);
  if (auth.error) return auth.error;
  if (!isSubmitter(auth)) return fail('Forbidden', 403);
  let body;
  try { body = await request.json(); } catch { body = {}; }
  const requestedId = typeof body?.definitionId === 'string' && body.definitionId ? body.definitionId : null;

  // Completeness is checked again at the final approval; checking here too
  // tells the submitter what's missing before anyone is asked to review.
  const publishDoc = await prisma.document.findFirst({ where: { id, deletedAt: null }, select: PUBLISH_SELECT });
  try {
    const result = await prisma.$transaction(async (tx) => {
      const doc = await tx.document.findFirst({
        where: { id, orgId: auth.doc.orgId, scope: 'repository', deletedAt: null },
        select: { id: true, lifecycle: true, departmentId: true },
      });
      if (!doc) throw new Error('DOCUMENT_GONE');
      const running = await tx.workflowInstance.findFirst({ where: { documentId: id, orgId: auth.doc.orgId, status: 'in_review' }, select: { id: true } });
      if (running) throw new Error('ALREADY_ACTIVE');

      let definition;
      if (requestedId) {
        definition = await tx.workflowDefinition.findFirst({
          where: { id: requestedId, orgId: auth.doc.orgId, active: true }, include: { stages: { orderBy: { position: 'asc' } } },
        });
        if (!definition?.stages.length) throw new Error('INVALID_DEFINITION');
      } else {
        const chosen = choosePublishDefinition(await activeDefinitions(tx, auth.doc.orgId, 'publish'), null);
        if (chosen.error) throw new Error(chosen.error);
        if (!chosen.definition) throw new Error('NO_WORKFLOW');
        definition = chosen.definition;
      }

      if (definition.kind === 'decommission') {
        if (!validateDecommissionTarget(doc.lifecycle, body.targetLifecycle)) throw new Error('INVALID_TARGET');
      } else {
        if (body.targetLifecycle) throw new Error('INVALID_TARGET');
        if (doc.lifecycle !== 'draft') throw new Error('NOT_DRAFT');
        const completeness = await publishingCompleteness(publishDoc);
        if (!completeness.complete) { const e = new Error('INCOMPLETE'); e.completeness = completeness; throw e; }
      }

      const started = await startWorkflowInstance(tx, {
        orgId: auth.doc.orgId, documentId: id, departmentId: doc.departmentId, definition,
        submittedById: auth.user.id, targetLifecycle: definition.kind === 'decommission' ? body.targetLifecycle : null,
      });
      if (definition.kind === 'publish' &&
          !(await moveLifecycle(tx, { documentId: id, orgId: auth.doc.orgId, from: 'draft', to: 'in_review' }))) {
        throw new Error('CONFLICT');
      }
      return started;
    }, { isolationLevel: 'Serializable' });

    await notify({
      orgId: auth.doc.orgId, userIds: [result.assigneeId], type: 'workflow.task_assigned',
      title: 'Document review assigned', body: 'A document is awaiting your approval.',
      link: `/document?id=${encodeURIComponent(id)}`,
    });
    return NextResponse.json({ id: result.instance.id, status: 'in_review' }, { status: 201 });
  } catch (error) {
    const known = {
      DOCUMENT_GONE: ['Document not found', 404],
      ALREADY_ACTIVE: ['An approval workflow is already running for this document', 409],
      INVALID_DEFINITION: ['Choose an active workflow with at least one stage', 400],
      CHOOSE_DEFINITION: ['Several approval workflows are active; choose one', 400],
      NO_WORKFLOW: ['No approval workflow is active; publish the document directly', 400],
      INVALID_TARGET: ['That decommission action is not allowed for this document', 400],
      NOT_DRAFT: ['Only draft documents can be submitted for publishing', 409],
      NO_APPROVER: ['Nobody other than you can approve this stage; add an approver or a department admin', 400],
      CONFLICT: ['Document changed; refresh and retry', 409],
    };
    if (error.message === 'INCOMPLETE') return fail('Required metadata incomplete', 422, { completeness: error.completeness });
    if (known[error.message]) return fail(...known[error.message]);
    if (error.code === 'P2034' || error.code === 'P2002') return fail('Concurrent submission; retry', 409);
    console.error('Workflow submit failed', error);
    return fail('Unable to submit workflow', 500);
  }
}

export async function DELETE(_request, { params }) {
  const { id } = await params;
  const auth = await access(id);
  if (auth.error) return auth.error;
  try {
    const result = await prisma.$transaction(async (tx) => {
      const instance = await tx.workflowInstance.findFirst({
        where: { documentId: id, orgId: auth.doc.orgId, status: 'in_review' },
        include: { definition: { select: { kind: true } }, tasks: { where: { status: 'pending' }, select: { assigneeId: true } } },
      });
      if (!instance) throw new Error('NOT_ACTIVE');
      if (auth.role !== 'super_admin' && instance.submittedById !== auth.user.id) throw new Error('FORBIDDEN');
      const claimed = await tx.workflowInstance.updateMany({ where: { id: instance.id, status: 'in_review' }, data: { status: 'cancelled' } });
      if (claimed.count !== 1) throw new Error('CONFLICT');
      await tx.workflowTask.updateMany({ where: { instanceId: instance.id, status: 'pending' }, data: { status: 'cancelled', decidedAt: new Date() } });
      if (instance.definition.kind === 'publish') {
        await moveLifecycle(tx, { documentId: id, orgId: auth.doc.orgId, from: 'in_review', to: 'draft' });
      }
      await tx.auditLog.create({ data: {
        orgId: auth.doc.orgId, actorUserId: auth.user.id, action: AUDIT_EVENTS.WORKFLOW_CANCELLED,
        entityType: 'document', entityId: id,
        before: { status: 'in_review' }, after: { status: 'cancelled' },
        metadata: { workflowInstanceId: instance.id, reason: 'withdrawn' },
      } });
      return { assignees: instance.tasks.map((t) => t.assigneeId) };
    }, { isolationLevel: 'Serializable' });
    const others = result.assignees.filter((u) => u !== auth.user.id);
    if (others.length) await notify({
      orgId: auth.doc.orgId, userIds: others, type: 'workflow.decided',
      title: 'Review withdrawn', body: 'A document you were asked to review was withdrawn.',
      link: `/document?id=${encodeURIComponent(id)}`,
    });
    return NextResponse.json({ status: 'cancelled' });
  } catch (error) {
    if (error.message === 'NOT_ACTIVE') return fail('No approval workflow is running for this document', 409);
    if (error.message === 'FORBIDDEN') return fail('Only the submitter or a super admin can withdraw', 403);
    if (error.message === 'CONFLICT' || error.code === 'P2034') return fail('Workflow changed; reload and retry', 409);
    console.error('Workflow withdraw failed', error);
    return fail('Unable to withdraw workflow', 500);
  }
}
