import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { resolveOrgRole, isSuperAdmin } from "@/lib/orgGuard";
import { getReviewQueueCount } from "@/lib/decisionIntelligence";

// Decision Extraction v2, FR-6: a lightweight, sidebar-friendly endpoint for
// the pending-review badge — avoids fetching the full decisions list just to
// read a count. Non-reviewers (no dept_admin/super_admin standing) always
// get 0, not an error, since the sidebar renders for every role.
export async function GET(req, { params }) {
  const session = await getServerSession();
  if (!session?.user?.email) return NextResponse.json({ count: 0 });

  const { orgId } = await params;
  const { user, role } = await resolveOrgRole(session.user.email, orgId);
  if (!user || !role) return NextResponse.json({ count: 0 });

  const superAdmin = isSuperAdmin(role);
  if (!superAdmin && role !== "dept_admin") return NextResponse.json({ count: 0 });

  try {
    const count = await getReviewQueueCount({ orgId, userId: user.id, isSuperAdmin: superAdmin });
    return NextResponse.json({ count });
  } catch (error) {
    console.error("Failed to load pending decision count:", error);
    return NextResponse.json({ count: 0 });
  }
}
