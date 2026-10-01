import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { resolveOrgRole, isOrgAdmin } from "@/lib/orgGuard";

const CONFIDENCE_WEIGHT = { high: 1, medium: 0.5, low: 0 };
const CONFIDENCE_SAMPLE_SIZE = 200;
const TOP_GAPS = 5;

// FR-P3-7: aggregate confidence/conflict/gap signals that already exist
// per-row from Phase 1/2 into one org-level health view — no new signal
// generation, just the aggregation layer.
export async function GET(req, { params }) {
  const session = await getServerSession();
  if (!session?.user?.email)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { orgId } = await params;
  const { user, role } = await resolveOrgRole(session.user.email, orgId);
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
  if (!role) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!isOrgAdmin(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const [recentMessages, openConflicts, topGaps] = await Promise.all([
    prisma.orgMessage.findMany({
      where: { role: "assistant", confidence: { not: null }, conversation: { orgId } },
      orderBy: { createdAt: "desc" },
      take: CONFIDENCE_SAMPLE_SIZE,
      select: { confidence: true },
    }),
    prisma.documentConflict.findMany({
      where: { status: "flagged", documentA: { orgId } },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        summary: true,
        createdAt: true,
        documentA: { select: { id: true, filename: true } },
        documentB: { select: { id: true, filename: true } },
      },
    }),
    prisma.knowledgeGap.findMany({
      where: { orgId },
      orderBy: { gapScore: "desc" },
      take: TOP_GAPS,
      select: {
        topic: true,
        gapScore: true,
        occurrenceCount: true,
        zeroCitationCount: true,
        lowConfidenceCount: true,
        createdAt: true,
      },
    }),
  ]);

  const distribution = { high: 0, medium: 0, low: 0 };
  let weightedSum = 0;
  for (const message of recentMessages) {
    if (message.confidence in distribution) distribution[message.confidence] += 1;
    weightedSum += CONFIDENCE_WEIGHT[message.confidence] ?? 0;
  }

  return NextResponse.json({
    confidence: {
      avgScore: recentMessages.length > 0 ? weightedSum / recentMessages.length : null,
      distribution,
      sampleSize: recentMessages.length,
    },
    conflicts: {
      openCount: openConflicts.length,
      items: openConflicts.map((c) => ({
        id: c.id,
        summary: c.summary,
        createdAt: c.createdAt,
        documentA: c.documentA,
        documentB: c.documentB,
      })),
    },
    gaps: topGaps,
  });
}
