import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { resolveOrgRole, isSuperAdmin, canManageDepartment } from "@/lib/orgGuard";
import { getRecommendations, getDepartmentRecommendations, recordRecommendationImpressions } from "@/lib/recommendations";

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
  const excludeProjectId = searchParams.get("excludeProjectId") || null;
  const limit = searchParams.get("limit") || 6;
  const mode = searchParams.get("mode") || "personal";

  try {
    let result;
    if (mode === "department") {
      if (!departmentId) return NextResponse.json({ error: "departmentId is required" }, { status: 400 });
      const allowed = isSuperAdmin(role) || (role === "dept_admin" && await canManageDepartment(role, departmentId, user.id));
      if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      result = await getDepartmentRecommendations({ orgId, departmentId, limit });
    } else {
      result = await getRecommendations({
        orgId,
        userId: user.id,
        isSuperAdmin: isSuperAdmin(role),
        query,
        departmentId,
        excludeProjectId,
        limit,
      });
    }

    void recordRecommendationImpressions({ orgId, userId: user.id, recommendations: result.recommendations }).catch((error) => {
      console.error("Failed to record recommendation impressions:", error);
    });

    return NextResponse.json({ ...result, canViewDepartment: role === "dept_admin" || isSuperAdmin(role) });
  } catch (error) {
    if (error?.message === "ORG_OPENAI_KEY_MISSING") {
      return NextResponse.json({ error: "ORG_OPENAI_KEY_MISSING" }, { status: 400 });
    }
    console.error("Recommendation generation failed:", error);
    return NextResponse.json({ error: "Failed to generate recommendations" }, { status: 500 });
  }
}
