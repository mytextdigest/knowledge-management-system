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
import { definitionCovers, specificity } from "./engine.mjs";

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
 * E22.3: the active definitions of one kind that apply to a document, i.e.
 * those covering its department and category, keeping only the most specific
 * (a workflow scoped to Engineering beats an org-wide one).
 */
export async function applicableDefinitions(db, orgId, kind, { departmentId, category }) {
  const covering = (await activeDefinitions(db, orgId, kind))
    .filter((d) => definitionCovers(d, { departmentId, category }));
  const top = Math.max(-1, ...covering.map(specificity));
  return covering.filter((d) => specificity(d) === top);
}

/**
 * E22: lifecycle for a new repository upload. While an active publish
 * workflow covers its department/category it starts as a draft, to be
 * submitted for approval once processed; otherwise it's published at once,
 * as before E22. (Connector documents always start as drafts.)
 */
export async function initialUploadLifecycle(db, { orgId, scope, departmentId, category }) {
  if (scope !== "repository" || !orgId) return "published";
  return (await applicableDefinitions(db, orgId, "publish", { departmentId: departmentId ?? null, category: category ?? null })).length
    ? "draft" : "published";
}

/**
 * Which publish definition applies, from applicableDefinitions(): none ->
 * null (direct publish, as before E22); one -> that one; several equally
 * specific -> the caller must choose (requestedId).
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

const inOrg = (orgId) => ({ user: { orgMembers: { some: { orgId } } } });

/** The people a stage's approverType names for this document, without fallback. */
async function namedApprovers(db, { orgId, stage, documentId, departmentId }) {
  const type = stage.approverType || "user";
  if (type === "user") return stage.approverUserId ? [stage.approverUserId] : [];
  if (type === "dept_admin") {
    if (!departmentId) return [];
    const admins = await db.departmentMember.findMany({
      where: { departmentId, role: "admin", ...inOrg(orgId) },
      orderBy: { createdAt: "asc" }, select: { userId: true },
    });
    return admins.map((a) => a.userId);
  }
  if (type === "owner") {
    const doc = await db.document.findUnique({ where: { id: documentId }, select: { ownerId: true } });
    return doc?.ownerId ? [doc.ownerId] : [];
  }
  const stewards = await db.documentSteward.findMany({
    where: { documentId, ...inOrg(orgId) }, orderBy: { createdAt: "asc" }, select: { userId: true },
  });
  return stewards.map((s) => s.userId);
}

/**
 * The users who act on a stage; never the submitter. The people the stage
 * names (E22.2: a named user, the document department's admins, its owner or
 * its stewards) who are someone else and still in the org; if none, an admin
 * of the document's department; otherwise a super admin. A stage that names
 * several people gets a task for each (approvalMode any/all decides how they
 * settle it); fallbacks are always one person. [] if nobody else can act.
 */
export async function resolveStageAssignees(db, { orgId, stage, submittedById, documentId, departmentId }) {
  const named = [...new Set(await namedApprovers(db, { orgId, stage, documentId, departmentId }))]
    .filter((id) => id !== submittedById);
  if (named.length) {
    const members = await db.organizationMember.findMany({
      where: { orgId, userId: { in: named } }, select: { userId: true },
    });
    const kept = new Set(members.map((m) => m.userId));
    const assignees = named.filter((id) => kept.has(id));
    if (assignees.length) return assignees;
  }
  if (departmentId) {
    const deptAdmin = await db.departmentMember.findFirst({
      where: { departmentId, role: "admin", userId: { not: submittedById }, ...inOrg(orgId) },
      orderBy: { createdAt: "asc" },
      select: { userId: true },
    });
    if (deptAdmin) return [deptAdmin.userId];
  }
  const superAdmin = await db.organizationMember.findFirst({
    where: { orgId, role: "super_admin", userId: { not: submittedById } },
    orderBy: { userId: "asc" },
    select: { userId: true },
  });
  return superAdmin ? [superAdmin.userId] : [];
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
  const assigneeIds = await resolveStageAssignees(db, { orgId, stage, submittedById, documentId, departmentId });
  if (!assigneeIds.length) throw new Error("NO_APPROVER");
  const instance = await db.workflowInstance.create({
    data: {
      orgId, documentId, definitionId: definition.id, submittedById, targetLifecycle,
      tasks: { create: assigneeIds.map((assigneeId) => ({ stageId: stage.id, assigneeId })) },
    },
  });
  await db.auditLog.create({
    data: {
      orgId, actorUserId: submittedById, action: AUDIT_EVENTS.WORKFLOW_SUBMITTED,
      entityType: "document", entityId: documentId,
      metadata: { workflowInstanceId: instance.id, definitionId: definition.id, kind: definition.kind, assigneeIds },
    },
  });
  return { instance, assigneeIds };
}

/** Compare-and-swap a document's lifecycle; false if it changed meanwhile. */
export async function moveLifecycle(db, { documentId, orgId, from, to }) {
  const changed = await db.document.updateMany({
    where: { id: documentId, orgId, scope: "repository", deletedAt: null, lifecycle: from },
    data: { lifecycle: to },
  });
  return changed.count === 1;
}
