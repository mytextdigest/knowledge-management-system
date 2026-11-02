// EKP B-15 (E22): the database side of approval workflows, shared by the
// submit, decision, withdraw and Needs-Review confirm routes. Pure rules stay
// in engine.mjs. Every function takes the transaction client (`db`).
//
// Lifecycle while a publish workflow runs:
//   draft --submit--> in_review --final approval--> published
//                     in_review --reject / request changes / withdraw--> draft
// in_review documents are hidden like drafts (F1, documentAccess.js); the
// submitter, the assigned reviewers and admins can still open them.

import { AUDIT_EVENTS } from "../audit/events.js";

/** Lifecycle states that are never shown to ordinary members. */
export const UNPUBLISHED_LIFECYCLES = ["draft", "in_review"];

/** Active definitions of one kind, oldest first, with ordered stages. */
export function activeDefinitions(db, orgId, kind) {
  return db.workflowDefinition.findMany({
    where: { orgId, kind, active: true },
    include: { stages: { orderBy: { position: "asc" } } },
    orderBy: { createdAt: "asc" },
  });
}

/**
 * Which publish definition applies. Workflows are org-wide in Phase 1 (no
 * department/category scoping), so: none active -> null (direct publish, as
 * before E22); one active -> that one; several -> the caller must choose.
 */
export function choosePublishDefinition(definitions, requestedId) {
  if (requestedId) {
    const definition = definitions.find((d) => d.id === requestedId);
    return definition ? { definition } : { error: "INVALID_DEFINITION" };
  }
  if (!definitions.length) return { definition: null };
  if (definitions.length === 1) return { definition: definitions[0] };
  return { error: "CHOOSE_DEFINITION" };
}

/**
 * The user who acts on a stage; never the submitter. The stage's approver if
 * they're someone else and still in the org; otherwise an admin of the
 * document's department; otherwise a super admin. null if nobody else can.
 */
export async function resolveStageAssignee(db, { orgId, stage, submittedById, departmentId }) {
  if (stage.approverUserId !== submittedById) {
    const member = await db.organizationMember.findUnique({
      where: { orgId_userId: { orgId, userId: stage.approverUserId } },
      select: { userId: true },
    });
    if (member) return stage.approverUserId;
  }
  if (departmentId) {
    const deptAdmin = await db.departmentMember.findFirst({
      where: {
        departmentId,
        role: "admin",
        userId: { not: submittedById },
        user: { orgMembers: { some: { orgId } } },
      },
      orderBy: { createdAt: "asc" },
      select: { userId: true },
    });
    if (deptAdmin) return deptAdmin.userId;
  }
  const superAdmin = await db.organizationMember.findFirst({
    where: { orgId, role: "super_admin", userId: { not: submittedById } },
    orderBy: { userId: "asc" },
    select: { userId: true },
  });
  return superAdmin?.userId ?? null;
}

/**
 * Create the instance and its first task, and audit the submission. The
 * caller moves the document's lifecycle (publish: draft -> in_review) in the
 * same transaction. Throws NO_APPROVER if nobody but the submitter could act.
 */
export async function startWorkflowInstance(db, {
  orgId, documentId, departmentId, definition, submittedById, targetLifecycle = null,
}) {
  const stage = definition.stages[0];
  if (!stage) throw new Error("INVALID_DEFINITION");
  const assigneeId = await resolveStageAssignee(db, { orgId, stage, submittedById, departmentId });
  if (!assigneeId) throw new Error("NO_APPROVER");
  const instance = await db.workflowInstance.create({
    data: {
      orgId, documentId, definitionId: definition.id, submittedById, targetLifecycle,
      tasks: { create: { stageId: stage.id, assigneeId } },
    },
  });
  await db.auditLog.create({
    data: {
      orgId, actorUserId: submittedById, action: AUDIT_EVENTS.WORKFLOW_SUBMITTED,
      entityType: "document", entityId: documentId,
      metadata: { workflowInstanceId: instance.id, definitionId: definition.id, kind: definition.kind, assigneeId },
    },
  });
  return { instance, assigneeId };
}

/** Compare-and-swap a document's lifecycle; false if it changed meanwhile. */
export async function moveLifecycle(db, { documentId, orgId, from, to }) {
  const changed = await db.document.updateMany({
    where: { id: documentId, orgId, scope: "repository", deletedAt: null, lifecycle: from },
    data: { lifecycle: to },
  });
  return changed.count === 1;
}
