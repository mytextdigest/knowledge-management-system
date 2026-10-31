import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { resolveOrgRole, isSuperAdmin } from "@/lib/orgGuard";
import { getAccessibleOrgRelationships } from "@/lib/knowledgeContext";
export async function GET(req, { params }) {
  const session = await getServerSession();
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { orgId } = await params;
  const { user, role } = await resolveOrgRole(session.user.email, orgId);
  if (!user || !role) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const limit = new URL(req.url).searchParams.get("limit") || 100;
  const items = await getAccessibleOrgRelationships({ orgId, userId: user.id, isSuperAdmin: isSuperAdmin(role), limit });
  return NextResponse.json({ relationships: items });
}
