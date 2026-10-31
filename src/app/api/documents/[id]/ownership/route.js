import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { resolveOrgRole, canManageDepartment } from '@/lib/orgGuard';
import { AUDIT_EVENTS } from '@/lib/audit/events';
import { validateOwnerCandidate, validateStewards } from '@/lib/governance/ownership.mjs';
import { redactAuditValue } from '@/lib/audit/redact.mjs';
import { notify } from '@/lib/notifications/notify';

const response = (error, status) => NextResponse.json({ error }, { status });
const unique = (values) => [...new Set(values)];

async function authorize(email, documentId) {
  const doc = await prisma.document.findFirst({
    where: { id: documentId, scope: 'repository', deletedAt: null },
    select: { id: true, orgId: true, departmentId: true, ownerId: true,
      stewards: { select: { userId: true } } },
  });
  if (!doc?.orgId) return { error: response('Not found', 404) };
  const { user, role } = await resolveOrgRole(email, doc.orgId);
  if (!user || !role) return { error: response('Forbidden', 403) };
  if (role !== 'super_admin' &&
      !(role === 'dept_admin' && doc.departmentId &&
        await canManageDepartment(role, doc.departmentId, user.id))) {
    return { error: response('Forbidden', 403) };
  }
  return { doc, user };
}

export async function GET(_req, { params }) {
  const session = await getServerSession();
  if (!session?.user?.email) return response('Unauthorized', 401);
  const { id } = await params;
  const auth = await authorize(session.user.email, id);
  if (auth.error) return auth.error;
  return NextResponse.json({
    documentId: id, ownerId: auth.doc.ownerId,
    stewardIds: auth.doc.stewards.map((s) => s.userId),
  });
}

export async function PATCH(req, { params }) {
  const session = await getServerSession();
  if (!session?.user?.email) return response('Unauthorized', 401);
  const { id } = await params;
  const auth = await authorize(session.user.email, id);
  if (auth.error) return auth.error;
  const { doc, user } = auth;
  let body;
  try { body = await req.json(); } catch { return response('Invalid JSON', 400); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return response('Invalid body', 400);
  const hasOwner = Object.hasOwn(body, 'ownerId');
  const hasStewards = Object.hasOwn(body, 'stewardIds');
  if (!hasOwner && !hasStewards) return response('ownerId or stewardIds required', 400);
  // Every editor must submit the snapshot they originally loaded.
  if (!Object.hasOwn(body, 'expectedOwnerId') ||
      (body.expectedOwnerId !== null && typeof body.expectedOwnerId !== 'string') ||
      validateStewards(body.expectedStewardIds))
    return response('Expected ownership snapshot required; reload and retry', 400);

  if (hasOwner && body.ownerId !== null &&
      (typeof body.ownerId !== 'string' || !body.ownerId.trim()))
    return response('ownerId must be a user ID or null', 400);
  if (hasStewards) {
    const issue = validateStewards(body.stewardIds);
    if (issue) return response(issue, 400);
  }
  const requested = unique([
    ...(hasOwner && body.ownerId ? [body.ownerId] : []),
    ...(hasStewards ? body.stewardIds : []),
  ]);
  // Membership and authority are rechecked inside the serializable transaction.
  // A pre-transaction membership lookup would leave a time-of-check/use gap.
  const previousStewards = doc.stewards.map((s) => s.userId).sort();
  const nextStewards = hasStewards ? [...body.stewardIds].sort() : previousStewards;
  const nextOwner = hasOwner ? body.ownerId : doc.ownerId;
  const expectedStewards = [...body.expectedStewardIds].sort();
  if (doc.ownerId !== body.expectedOwnerId ||
      JSON.stringify(previousStewards) !== JSON.stringify(expectedStewards))
    return response('Ownership changed; refresh and retry', 409);
  try {
    const result = await prisma.$transaction(async (tx) => {
      const currentActor = await tx.organizationMember.findUnique({
        where: { orgId_userId: { orgId: doc.orgId, userId: user.id } },
        select: { role: true },
      });
      const currentRole = currentActor?.role;
      if (currentRole !== 'super_admin') {
        if (currentRole !== 'dept_admin' || !doc.departmentId)
          throw new Error('OWNERSHIP_FORBIDDEN');
        const departmentAdmin = await tx.departmentMember.findUnique({
          where: { departmentId_userId: { departmentId: doc.departmentId, userId: user.id } },
          select: { role: true },
        });
        if (departmentAdmin?.role !== 'admin') throw new Error('OWNERSHIP_FORBIDDEN');
      }
      const currentDoc = await tx.document.findFirst({
        where: { id, orgId: doc.orgId, scope: 'repository', deletedAt: null },
        select: { ownerId: true, departmentId: true },
      });
      if (!currentDoc || currentDoc.ownerId !== body.expectedOwnerId ||
          currentDoc.departmentId !== doc.departmentId)
        throw new Error('OWNERSHIP_CONFLICT');
      const memberships = requested.length
        ? await tx.organizationMember.findMany({
            where: { orgId: doc.orgId, userId: { in: requested } },
            select: { userId: true },
          })
        : [];
      const members = new Set(memberships.map((m) => m.userId));
      if (hasOwner) {
        const issue = validateOwnerCandidate({
          orgId: doc.orgId, documentOrgId: doc.orgId, deletedAt: null,
          ownerIsMember: body.ownerId === null || members.has(body.ownerId),
        });
        if (issue) throw new Error('OWNERSHIP_INVALID_MEMBER');
      }
      if (hasStewards && body.stewardIds.some((memberId) => !members.has(memberId)))
        throw new Error('OWNERSHIP_INVALID_MEMBER');
      // Avoid silently overwriting another administrator's concurrent owner edit.
      const updated = await tx.document.updateMany({
        where: { id, orgId: doc.orgId, scope: 'repository', deletedAt: null,
          ownerId: body.expectedOwnerId, departmentId: doc.departmentId },
        data: hasOwner ? { ownerId: nextOwner } : {},
      });
      if (updated.count !== 1) throw new Error('OWNERSHIP_CONFLICT');
      if (hasStewards) {
        const current = await tx.documentSteward.findMany({
          where: { documentId: id }, select: { userId: true },
        });
        const currentIds = current.map((s) => s.userId).sort();
        if (JSON.stringify(currentIds) !== JSON.stringify(expectedStewards))
          throw new Error('OWNERSHIP_CONFLICT');
        await tx.documentSteward.deleteMany({ where: { documentId: id } });
        if (nextStewards.length) await tx.documentSteward.createMany({
          data: nextStewards.map((userId) => ({ documentId: id, userId })),
        });
      }
      if (hasOwner && nextOwner !== doc.ownerId) {
        await tx.auditLog.create({ data: {
          orgId: doc.orgId, actorUserId: user.id,
          action: AUDIT_EVENTS.DOCUMENT_OWNER_CHANGED,
          entityType: 'document', entityId: id,
          before: redactAuditValue({ ownerId: doc.ownerId }),
          after: redactAuditValue({ ownerId: nextOwner }),
        } });
      }
      if (hasStewards && JSON.stringify(nextStewards) !== JSON.stringify(previousStewards)) {
        await tx.auditLog.create({ data: {
          orgId: doc.orgId, actorUserId: user.id,
          action: AUDIT_EVENTS.DOCUMENT_STEWARD_CHANGED,
          entityType: 'document', entityId: id,
          before: redactAuditValue({ stewardIds: previousStewards }),
          after: redactAuditValue({ stewardIds: nextStewards }),
        } });
      }
      return { documentId: id, ownerId: nextOwner, stewardIds: nextStewards };
    }, { isolationLevel: 'Serializable', maxWait: 5000, timeout: 10000 });
    // Notification writes happen only after ownership and audit transaction commits.
    // Delivery is best-effort and cannot roll back a successful ownership update.
    const recipients = [...new Set([
      ...(hasOwner && result.ownerId && result.ownerId !== doc.ownerId ? [result.ownerId] : []),
      ...(hasStewards ? result.stewardIds.filter((uid) => !previousStewards.includes(uid)) : []),
    ])];
    if (recipients.length) {
      await notify({
        orgId: doc.orgId,
        userIds: recipients,
        type: 'ownership.assigned',
        title: 'Document ownership updated',
        body: 'You have been assigned as an owner or steward of a document.',
        link: `/document?id=${encodeURIComponent(id)}`,
      });
    }
    return NextResponse.json(result);
  } catch (error) {
    if (error?.message === 'OWNERSHIP_FORBIDDEN') return response('Forbidden', 403);
    if (error?.message === 'OWNERSHIP_INVALID_MEMBER')
      return response('Owner and stewards must belong to the organization', 400);
    if (error?.code === 'P2034') return response('Concurrent update; refresh and retry', 409);
    if (error?.message === 'OWNERSHIP_CONFLICT')
      return response('Document ownership changed; refresh and retry', 409);
    console.error('Document ownership update failed:', error?.message);
    return response('Unable to update ownership', 500);
  }
}
