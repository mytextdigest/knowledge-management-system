import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { resolveOrgRole, isSuperAdmin } from "@/lib/orgGuard";

// Sidebar badges: what is waiting on the caller. approvals + reviews feed
// "My Tasks"; needsReview (super admins only, same filter as the Needs
// Review queue) feeds the Governance group.
export async function GET(_req, { params }) {
  const session = await getServerSession();
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { orgId } = await params;
  const { user, role } = await resolveOrgRole(session.user.email, orgId);
  if (!user || !role) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const [approvals, reviews, needsReview] = await Promise.all([
    prisma.workflowTask.count({ where: { assigneeId: user.id, status: "pending", instance: { orgId, status: "in_review" } } }),
    prisma.reviewRecord.count({ where: { orgId, reviewerId: user.id, status: "pending" } }),
    isSuperAdmin(role)
      ? prisma.document.count({ where: { orgId, scope: "repository", deletedAt: null, OR: [{ lifecycle: "draft" }, { classificationStatus: "needs_review" }] } })
      : 0,
  ]);
  return NextResponse.json({ approvals, reviews, needsReview });
}
