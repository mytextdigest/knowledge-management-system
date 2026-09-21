import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { resolveOrgRole, isSuperAdmin } from "@/lib/orgGuard";
import { canAccessDecisionDocument, canManageDecision } from "@/lib/decisionAccess";

const STATUSES = ["active", "reversed", "superseded"];
const MAX_NOTE_LENGTH = 2000;

function serializeDecision(decision, { canManage = false } = {}) {
  return {
    id: decision.id,
    statement: decision.statement,
    rationale: decision.rationale,
    status: decision.status,
    statusNote: decision.statusNote,
    decidedAt: decision.decidedAt,
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
    canManage,
  };
}

async function loadDecision(decisionId, orgId) {
  return prisma.decision.findFirst({
    where: { id: decisionId, document: { orgId } },
    include: {
      document: {
        select: {
          id: true,
          filename: true,
          userId: true,
          scope: true,
          lifecycle: true,
          departmentId: true,
          projectId: true,
          department: { select: { name: true } },
          project: { select: { name: true } },
        },
      },
      // FR-3: only Lesson rows that explicitly reference this decision —
      // read-only consumption of the existing Lesson.decisionId relation.
      lessons: { orderBy: { createdAt: "desc" } },
      // FR-5: any TimelineEvent chained off this same decision.
      timelineEvents: { orderBy: { occurredAt: "desc" } },
    },
  });
}

// Rank 14, FR-5 (detail view) + FR-3 (linked lessons). RBAC: never visible to
// a user who couldn't already access the source document (Non-Functional
// Requirements) — reuses canAccessDecisionDocument, the same rule
// getAccessibleDecisions applies for the list view.
export async function GET(req, { params }) {
  const session = await getServerSession();
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { orgId, decisionId } = await params;
  const { user, role } = await resolveOrgRole(session.user.email, orgId);
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
  if (!role) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const decision = await loadDecision(decisionId, orgId);
  if (!decision) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const superAdmin = isSuperAdmin(role);
  const hasAccess = await canAccessDecisionDocument({ document: decision.document, userId: user.id, isSuperAdmin: superAdmin });
  if (!hasAccess) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const canManage = superAdmin || (await canManageDecision({ document: decision.document, userId: user.id, role }));
  return NextResponse.json(serializeDecision(decision, { canManage }));
}

// Rank 14, FR-2/FR-6 (Task 15-G): outcome status write path. Human-driven,
// never auto-inferred by an LLM, consistent with the Lessons Learned
// publish-gate precedent — gated on canManageDecision (document owner or a
// department admin who can manage the document's department), never on
// authorship of a Lesson referencing the decision.
export async function PATCH(req, { params }) {
  const session = await getServerSession();
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { orgId, decisionId } = await params;
  const { user, role } = await resolveOrgRole(session.user.email, orgId);
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
  if (!role) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const decision = await loadDecision(decisionId, orgId);
  if (!decision) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const superAdmin = isSuperAdmin(role);
  const hasAccess = await canAccessDecisionDocument({ document: decision.document, userId: user.id, isSuperAdmin: superAdmin });
  if (!hasAccess) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const canManage = superAdmin || (await canManageDecision({ document: decision.document, userId: user.id, role }));
  if (!canManage) {
    return NextResponse.json(
      { error: "Only the source document's owner or a department admin can change a decision's status" },
      { status: 403 }
    );
  }

  const body = await req.json().catch(() => ({}));
  if (!STATUSES.includes(body.status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }
  if (body.statusNote !== undefined && body.statusNote !== null && String(body.statusNote).length > MAX_NOTE_LENGTH) {
    return NextResponse.json({ error: "Note is too long" }, { status: 400 });
  }

  // statusNote always travels with status in one save (per the requirements
  // doc: a note explains *why* the outcome changed) — an omitted/empty note
  // clears it rather than leaving a stale note attached to a new status.
  const statusNote = body.statusNote ? String(body.statusNote).trim().slice(0, MAX_NOTE_LENGTH) || null : null;

  const updated = await prisma.decision.update({
    where: { id: decisionId },
    data: { status: body.status, statusNote },
    include: {
      document: {
        select: {
          id: true, filename: true, userId: true, scope: true, lifecycle: true,
          departmentId: true, projectId: true,
          department: { select: { name: true } },
          project: { select: { name: true } },
        },
      },
      lessons: { orderBy: { createdAt: "desc" } },
      timelineEvents: { orderBy: { occurredAt: "desc" } },
    },
  });

  return NextResponse.json(serializeDecision(updated, { canManage: true }));
}
