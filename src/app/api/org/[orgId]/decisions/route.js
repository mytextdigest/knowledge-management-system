import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { resolveOrgRole, isSuperAdmin } from "@/lib/orgGuard";
import { getAccessibleDecisions, getReviewQueueDecisions, getReviewQueueCount } from "@/lib/decisionIntelligence";
import { STATUS_ORDER } from "@/lib/decisionStatus";
import { canAccessDecisionDocument, canReviewDecision } from "@/lib/decisionAccess";
import { serializeDecision, loadDecisionForReview } from "@/lib/decisionReview";

const MAX_STATEMENT_LENGTH = 2000;
const MAX_RATIONALE_LENGTH = 4000;

// Rank 14 (Decision Intelligence Repository), FR-1/FR-4, extended by
// Decision Extraction v2 (REQUIREMENTS_DECISION_EXTRACTION_V2_HITL.md, FR-6):
// org-wide, RBAC-scoped, filterable/searchable decision listing. A
// status=pending|rejected request is routed to the reviewer-scoped review
// queue instead of the general browse query — getAccessibleDecisions can
// never return those two statuses (see decisionIntelligence.js), so this
// branch is the only path that can. `reviewQueueCount` is included whenever
// the requester has any review standing (super_admin, or dept_admin of at
// least one department) so the UI can show a badge without a second request.
export async function GET(req, { params }) {
  const session = await getServerSession();
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { orgId } = await params;
  const { user, role } = await resolveOrgRole(session.user.email, orgId);
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
  if (!role) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const query = searchParams.get("query") || "";
  const departmentId = searchParams.get("departmentId") || null;
  const projectId = searchParams.get("projectId") || null;
  const status = searchParams.get("status") || null;
  const from = searchParams.get("from") || null;
  const to = searchParams.get("to") || null;
  const limit = searchParams.get("limit") || 20;
  const offset = searchParams.get("offset") || 0;

  if (status && !STATUS_ORDER.includes(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const superAdmin = isSuperAdmin(role);
  const mayReview = superAdmin || role === "dept_admin";

  try {
    const decisions =
      status === "pending" || status === "rejected"
        ? await getReviewQueueDecisions({ orgId, userId: user.id, isSuperAdmin: superAdmin, status, limit })
        : await getAccessibleDecisions({
            orgId,
            userId: user.id,
            isSuperAdmin: superAdmin,
            departmentId,
            projectId,
            status,
            from,
            to,
            query,
            limit,
            offset,
          });

    const reviewQueueCount = mayReview
      ? await getReviewQueueCount({ orgId, userId: user.id, isSuperAdmin: superAdmin })
      : 0;

    return NextResponse.json({ decisions, reviewQueueCount, canReview: mayReview });
  } catch (error) {
    console.error("Failed to list decisions:", error);
    return NextResponse.json({ error: "Failed to load decisions" }, { status: 500 });
  }
}

// Decision Extraction v2, DX-L (optional, requirements doc FR-6): a reviewer
// can add a decision the extractor missed. Lands "active" immediately, not
// "pending" — the reviewer's own act of entering it *is* the review, per the
// requirements doc's DecisionEvidence.source model. Survives
// reconcile-on-regenerate like any other reviewed row since it's never
// "source: extracted" + "status: pending" (worker/index.js only touches
// unreviewed pending rows).
export async function POST(req, { params }) {
  const session = await getServerSession();
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { orgId } = await params;
  const { user, role } = await resolveOrgRole(session.user.email, orgId);
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
  if (!role) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const documentId = String(body.documentId || "").trim();
  const statement = String(body.statement || "").trim().slice(0, MAX_STATEMENT_LENGTH);
  if (!documentId) return NextResponse.json({ error: "documentId is required" }, { status: 400 });
  if (!statement) return NextResponse.json({ error: "statement is required" }, { status: 400 });

  const document = await prisma.document.findFirst({
    where: { id: documentId, orgId },
    select: { id: true, userId: true, scope: true, lifecycle: true, departmentId: true, projectId: true },
  });
  if (!document) return NextResponse.json({ error: "Document not found" }, { status: 404 });

  const superAdmin = isSuperAdmin(role);
  const hasAccess = await canAccessDecisionDocument({ document, userId: user.id, isSuperAdmin: superAdmin });
  if (!hasAccess) return NextResponse.json({ error: "Document not found" }, { status: 404 });

  const isReviewer = superAdmin || (await canReviewDecision({ document, userId: user.id, role }));
  if (!isReviewer) {
    return NextResponse.json(
      { error: "Only a department admin who manages this document's department, or a super admin, can add a decision" },
      { status: 403 }
    );
  }

  let decidedAt = null;
  if (body.decidedAt) {
    const parsed = new Date(body.decidedAt);
    if (Number.isNaN(parsed.getTime())) return NextResponse.json({ error: "Invalid decidedAt date" }, { status: 400 });
    decidedAt = parsed;
  }
  const rationale = body.rationale ? String(body.rationale).trim().slice(0, MAX_RATIONALE_LENGTH) || null : null;

  const created = await prisma.$transaction(async (tx) => {
    const decision = await tx.decision.create({
      data: {
        documentId,
        statement,
        rationale,
        decidedAt,
        status: "active",
        source: "manual",
        reviewedById: user.id,
        reviewedAt: new Date(),
      },
    });

    if (decidedAt) {
      await tx.timelineEvent.create({
        data: {
          documentId,
          projectId: document.projectId || null,
          departmentId: document.departmentId || null,
          decisionId: decision.id,
          occurredAt: decidedAt,
          description: statement,
        },
      });
    }

    return decision;
  });

  const full = await loadDecisionForReview(created.id, orgId);
  return NextResponse.json(serializeDecision(full, { canReview: true }), { status: 201 });
}
