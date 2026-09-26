import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { resolveOrgRole, isSuperAdmin } from "@/lib/orgGuard";
import { canAccessDecisionDocument, canReviewDecision } from "@/lib/decisionAccess";
import { loadDecisionForReview, serializeDecision, applyDecisionReview, ReviewError } from "@/lib/decisionReview";

// Rank 14, FR-5 (detail view) + FR-3 (decision-to-lesson linkage display),
// extended by Decision Extraction v2: a "pending"/"rejected" decision is
// invisible to anyone who isn't a reviewer for its department (FR-5) — it
// returns 404, same as a document the requester can't otherwise see, so a
// pending decision's existence isn't leaked either.
export async function GET(req, { params }) {
  const session = await getServerSession();
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { orgId, decisionId } = await params;
  const { user, role } = await resolveOrgRole(session.user.email, orgId);
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
  if (!role) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const decision = await loadDecisionForReview(decisionId, orgId);
  if (!decision) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const superAdmin = isSuperAdmin(role);
  const hasAccess = await canAccessDecisionDocument({ document: decision.document, userId: user.id, isSuperAdmin: superAdmin });
  if (!hasAccess) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const isReviewer = superAdmin || (await canReviewDecision({ document: decision.document, userId: user.id, role }));

  if ((decision.status === "pending" || decision.status === "rejected") && !isReviewer) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(serializeDecision(decision, { canReview: isReviewer }));
}

// Rank 14 FR-2/FR-6, superseded by Decision Extraction v2 Decision 5: every
// status transition (confirm, reject, and outcome changes to
// reversed/superseded alike) now requires canReviewDecision — dept_admin who
// manages this decision's department, or super_admin. The document's
// owner/uploader is no longer sufficient on its own. A human can never set
// status to "pending" (worker-only). Reviewers may also edit
// statement/rationale/decidedAt before confirming; the extractor's original
// statement is preserved in aiStatement on first edit, so reconcile-on-
// regenerate can still match this row against a future extraction. Shared
// validation/transaction logic lives in src/lib/decisionReview.js, reused by
// the bulk-review route.
export async function PATCH(req, { params }) {
  const session = await getServerSession();
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { orgId, decisionId } = await params;
  const { user, role } = await resolveOrgRole(session.user.email, orgId);
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
  if (!role) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));

  try {
    const updated = await applyDecisionReview({ orgId, decisionId, user, role, body });
    return NextResponse.json(serializeDecision(updated, { canReview: true }));
  } catch (error) {
    if (error instanceof ReviewError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("Failed to update decision:", error);
    return NextResponse.json({ error: "Failed to update decision" }, { status: 500 });
  }
}
