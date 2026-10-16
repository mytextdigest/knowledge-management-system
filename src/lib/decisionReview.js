// Decision Extraction v2 (docs/tier-2/REQUIREMENTS_DECISION_EXTRACTION_V2_HITL.md,
// FR-6): the single review-update path shared by the per-decision PATCH
// route and the bulk-review route, so both apply identical authorization,
// validation, and timeline-sync behavior rather than two copies drifting
// apart. Each id in a bulk call is authorized independently (FR-6) — this
// module is what makes that cheap to guarantee.

import { prisma } from "@/lib/prisma";
import { isSuperAdmin } from "@/lib/orgGuard";
import { canAccessDecisionDocument, canReviewDecision } from "@/lib/decisionAccess";
import { HUMAN_SETTABLE_STATUSES } from "@/lib/decisionStatus";

const MAX_NOTE_LENGTH = 2000;
const MAX_STATEMENT_LENGTH = 2000;
const MAX_RATIONALE_LENGTH = 4000;

const DECISION_INCLUDE = {
  document: {
    select: {
      id: true, filename: true, userId: true, scope: true, lifecycle: true,
      departmentId: true, projectId: true,
      department: { select: { name: true } },
      project: { select: { name: true, departmentId: true } },
    },
  },
  lessons: { orderBy: { createdAt: "desc" } },
  timelineEvents: { orderBy: { occurredAt: "desc" } },
  evidence: { orderBy: { createdAt: "asc" } },
  reviewedBy: { select: { id: true, name: true, email: true } },
};

export function serializeDecision(decision, { canReview = false } = {}) {
  return {
    id: decision.id,
    statement: decision.statement,
    rationale: decision.rationale,
    status: decision.status,
    statusNote: decision.statusNote,
    decidedAt: decision.decidedAt,
    certainty: decision.certainty,
    explicitness: decision.explicitness,
    score: decision.score,
    signals: decision.signals,
    subject: decision.subject,
    actors: decision.actors,
    alternatives: decision.alternatives,
    source: decision.source,
    aiStatement: decision.aiStatement,
    reviewedAt: decision.reviewedAt,
    reviewNote: decision.reviewNote,
    reviewedBy: decision.reviewedBy ? { id: decision.reviewedBy.id, name: decision.reviewedBy.name, email: decision.reviewedBy.email } : null,
    evidence: decision.evidence.map((e) => ({ id: e.id, quote: e.quote, type: e.type, chunkIndex: e.chunkIndex })),
    document: {
      id: decision.document.id,
      filename: decision.document.filename,
      departmentName: decision.document.department?.name || null,
      projectName: decision.document.project?.name || null,
    },
    lessons: decision.lessons.map((lesson) => ({
      id: lesson.id,
      topic: lesson.topic,
      whatHappened: lesson.whatHappened,
      whatWorked: lesson.whatWorked,
      whatDidntWork: lesson.whatDidntWork,
      recommendation: lesson.recommendation,
      status: lesson.status,
      projectId: lesson.projectId,
    })),
    timelineEvents: decision.timelineEvents.map((event) => ({
      id: event.id,
      description: event.description,
      occurredAt: event.occurredAt,
      projectId: event.projectId,
      departmentId: event.departmentId,
    })),
    canReview,
  };
}

export function loadDecisionForReview(decisionId, orgId) {
  return prisma.decision.findFirst({ where: { id: decisionId, document: { orgId } }, include: DECISION_INCLUDE });
}

function effectiveDepartmentId(document) {
  return document.departmentId || document.project?.departmentId || null;
}

class ReviewError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/**
 * Validates and applies a single decision's review update (status,
 * statusNote, reviewNote, and/or a reviewer's edit to
 * statement/rationale/decidedAt), including the timeline-event sync. Throws
 * ReviewError with an HTTP status on any authorization/validation failure —
 * callers translate that to a response themselves.
 */
export async function applyDecisionReview({ orgId, decisionId, user, role, body }) {
  const decision = await loadDecisionForReview(decisionId, orgId);
  if (!decision) throw new ReviewError(404, "Not found");

  const superAdmin = isSuperAdmin(role);
  const hasAccess = await canAccessDecisionDocument({ document: decision.document, userId: user.id, isSuperAdmin: superAdmin });
  if (!hasAccess) throw new ReviewError(404, "Not found");

  const isReviewer = superAdmin || (await canReviewDecision({ document: decision.document, userId: user.id, role }));
  if (!isReviewer) {
    throw new ReviewError(403, "Only a department admin who manages this decision's department, or a super admin, can review a decision");
  }

  const data = {};

  if (body.status !== undefined) {
    if (!HUMAN_SETTABLE_STATUSES.includes(body.status)) throw new ReviewError(400, "Invalid status");
    data.status = body.status;
  }

  if (body.statusNote !== undefined) {
    if (body.statusNote !== null && String(body.statusNote).length > MAX_NOTE_LENGTH) throw new ReviewError(400, "Note is too long");
    data.statusNote = body.statusNote ? String(body.statusNote).trim().slice(0, MAX_NOTE_LENGTH) || null : null;
  }

  if (body.reviewNote !== undefined) {
    if (body.reviewNote !== null && String(body.reviewNote).length > MAX_NOTE_LENGTH) throw new ReviewError(400, "Review note is too long");
    data.reviewNote = body.reviewNote ? String(body.reviewNote).trim().slice(0, MAX_NOTE_LENGTH) || null : null;
  }

  if (body.statement !== undefined) {
    const statement = String(body.statement || "").trim().slice(0, MAX_STATEMENT_LENGTH);
    if (!statement) throw new ReviewError(400, "Statement cannot be empty");
    if (statement !== decision.statement) {
      if (!decision.aiStatement) data.aiStatement = decision.statement;
      data.statement = statement;
    }
  }

  if (body.rationale !== undefined) {
    data.rationale = body.rationale ? String(body.rationale).trim().slice(0, MAX_RATIONALE_LENGTH) || null : null;
  }

  if (body.decidedAt !== undefined) {
    if (body.decidedAt === null) {
      data.decidedAt = null;
    } else {
      const parsed = new Date(body.decidedAt);
      if (Number.isNaN(parsed.getTime())) throw new ReviewError(400, "Invalid decidedAt date");
      data.decidedAt = parsed;
    }
  }

  const isFirstReview = !decision.reviewedAt;
  const statusChanging = data.status !== undefined && data.status !== decision.status;

  if (statusChanging || isFirstReview) {
    data.reviewedById = user.id;
    data.reviewedAt = new Date();
  }

  const nextStatus = data.status ?? decision.status;
  const nextDecidedAt = data.decidedAt !== undefined ? data.decidedAt : decision.decidedAt;
  const nextStatement = data.statement ?? decision.statement;

  await prisma.$transaction(async (tx) => {
    const saved = await tx.decision.update({ where: { id: decisionId }, data, include: DECISION_INCLUDE });

    if (statusChanging) {
      const existingEvent = await tx.timelineEvent.findFirst({ where: { decisionId } });

      if (nextStatus === "rejected") {
        if (existingEvent) await tx.timelineEvent.deleteMany({ where: { decisionId } });
      } else if (nextStatus === "active" && nextDecidedAt && !existingEvent) {
        await tx.timelineEvent.create({
          data: {
            documentId: saved.documentId,
            projectId: saved.document.projectId || null,
            departmentId: effectiveDepartmentId(saved.document),
            decisionId: saved.id,
            occurredAt: nextDecidedAt,
            description: nextStatement,
          },
        });
      } else if (
        existingEvent &&
        (nextStatement !== existingEvent.description ||
          (nextDecidedAt && nextDecidedAt.getTime() !== new Date(existingEvent.occurredAt).getTime()))
      ) {
        await tx.timelineEvent.update({
          where: { id: existingEvent.id },
          data: { description: nextStatement, occurredAt: nextDecidedAt || existingEvent.occurredAt },
        });
      }
    }
  });

  return loadDecisionForReview(decisionId, orgId);
}

export { ReviewError };
