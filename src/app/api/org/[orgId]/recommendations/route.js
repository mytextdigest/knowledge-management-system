import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { resolveOrgRole, isSuperAdmin } from "@/lib/orgGuard";
import { getRecommendations } from "@/lib/recommendations";

export async function GET(req, { params }) {
  const session = await getServerSession();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { orgId } = await params;
  const { user, role } = await resolveOrgRole(session.user.email, orgId);
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
  if (!role) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const query = searchParams.get("query") || "";
  const departmentId = searchParams.get("departmentId") || null;
  const excludeProjectId = searchParams.get("excludeProjectId") || null;
  const limit = searchParams.get("limit") || 6;

  try {
    const result = await getRecommendations({
      orgId,
      userId: user.id,
      isSuperAdmin: isSuperAdmin(role),
      query,
      departmentId,
      excludeProjectId,
      limit,
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error?.message === "ORG_OPENAI_KEY_MISSING") {
      return NextResponse.json({ error: "ORG_OPENAI_KEY_MISSING" }, { status: 400 });
    }
    console.error("Recommendation generation failed:", error);
    return NextResponse.json({ error: "Failed to generate recommendations" }, { status: 500 });
  }
}
