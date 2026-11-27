import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { resolveOrgRole, isSuperAdmin } from "@/lib/orgGuard";
import { getTopicTrendWithPrisma } from "@/lib/topicSnapshotQuery.mjs";

// Rank 16 — Topic Evolution Tracking (FR-3). `topicRef` may be a still-live Topic's id
// (its first-ever snapshot uses the topic id itself as the ref — see
// scripts/task-17/capture-topic-snapshots.mjs's resolveTopicRef()) or a retired topic's
// stable ref. Returns 404 if unauthorized or nothing has ever been captured for this ref,
// so a viewer can't distinguish "no access" from "no history" — same as every other
// RBAC-gated lookup in this codebase.
export async function GET(req, { params }) {
  const session = await getServerSession();
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { orgId, topicRef } = await params;
  const { user, role } = await resolveOrgRole(session.user.email, orgId);
  if (!user || !role) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const trend = await getTopicTrendWithPrisma(prisma, {
    topicRef, userId: user.id, isSuperAdmin: isSuperAdmin(role),
  });
  if (!trend) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(trend);
}
