import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { resolveOrgRole, isSuperAdmin } from "@/lib/orgGuard";
import { getAccessibleTopicTrendsWithPrisma } from "@/lib/topicSnapshotQuery.mjs";

// Rank 16 — Topic Evolution Tracking (FR-3). Lists every topic (live or retired) the
// viewer can see at least a "not enough history yet" state for, most recently
// captured first — the browse surface for the trend detail view.
export async function GET(req, { params }) {
  const session = await getServerSession();
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { orgId } = await params;
  const { user, role } = await resolveOrgRole(session.user.email, orgId);
  if (!user || !role) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const topics = await getAccessibleTopicTrendsWithPrisma(prisma, {
    orgId, userId: user.id, isSuperAdmin: isSuperAdmin(role),
  });
  return NextResponse.json({ topics });
}
