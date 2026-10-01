import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { resolveOrgRole } from "@/lib/orgGuard";
import { applyDecisionReview, ReviewError } from "@/lib/decisionReview";

const MAX_IDS = 100;
const ACTIONS = { confirm: "active", reject: "rejected" };

// Decision Extraction v2, FR-6: "Confirm all in this document" / bulk queue
// actions. Each id is authorized and validated independently via
// applyDecisionReview (same path the single PATCH route uses) — an
// unauthorized or already-handled id fails on its own without blocking the
// rest of the batch, and the response reports every id's outcome so the UI
// can show exactly what did and didn't apply.
export async function POST(req, { params }) {
  const session = await getServerSession();
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { orgId } = await params;
  const { user, role } = await resolveOrgRole(session.user.email, orgId);
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
  if (!role) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const ids = Array.isArray(body.ids) ? [...new Set(body.ids.filter((id) => typeof id === "string" && id))] : [];
  const action = body.action;

  if (!ids.length) return NextResponse.json({ error: "No decision ids provided" }, { status: 400 });
  if (ids.length > MAX_IDS) return NextResponse.json({ error: `Too many ids (max ${MAX_IDS})` }, { status: 400 });
  if (!ACTIONS[action]) return NextResponse.json({ error: "Invalid action" }, { status: 400 });

  const status = ACTIONS[action];
  const note = body.note !== undefined ? body.note : undefined;

  const results = await Promise.all(
    ids.map(async (decisionId) => {
      try {
        await applyDecisionReview({
          orgId,
          decisionId,
          user,
          role,
          body: action === "reject" ? { status, reviewNote: note } : { status },
        });
        return { id: decisionId, ok: true };
      } catch (error) {
        if (error instanceof ReviewError) return { id: decisionId, ok: false, error: error.message, status: error.status };
        console.error(`Bulk review failed for decision ${decisionId}:`, error);
        return { id: decisionId, ok: false, error: "Failed to update decision", status: 500 };
      }
    })
  );

  const succeeded = results.filter((r) => r.ok).length;
  return NextResponse.json({ results, succeeded, failed: results.length - succeeded });
}
