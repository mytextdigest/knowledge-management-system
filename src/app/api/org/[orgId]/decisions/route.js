import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { resolveOrgRole, isSuperAdmin } from "@/lib/orgGuard";
import { getAccessibleDecisions } from "@/lib/decisionIntelligence";

// Rank 14 (Decision Intelligence Repository), FR-1/FR-4: org-wide,
// RBAC-scoped, filterable/searchable decision listing. See
// docs/tier-2/REQUIREMENTS_DECISION_INTELLIGENCE_REPOSITORY.md.
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

  if (status && !["active", "reversed", "superseded"].includes(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  try {
    const decisions = await getAccessibleDecisions({
      orgId,
      userId: user.id,
      isSuperAdmin: isSuperAdmin(role),
      departmentId,
      projectId,
      status,
      from,
      to,
      query,
      limit,
      offset,
    });
    return NextResponse.json({ decisions });
  } catch (error) {
    console.error("Failed to list decisions:", error);
    return NextResponse.json({ error: "Failed to load decisions" }, { status: 500 });
  }
}
