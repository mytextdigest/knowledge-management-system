import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { resolveOrgRole, isSuperAdmin } from "@/lib/orgGuard";
import { AUDIT_EVENTS } from "@/lib/audit/events";

// Admin-visible sync history (FR-3 NFR: failed syncs must be retryable and
// must not silently drop files — this is where a failure actually surfaces).
export async function GET(req, { params }) {
  const session = await getServerSession();
  if (!session?.user?.email)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { orgId } = await params;
  const { user, role } = await resolveOrgRole(session.user.email, orgId);
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
  if (!isSuperAdmin(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const integration = await prisma.orgIntegration.findUnique({
    where: { orgId_provider: { orgId, provider: "sharepoint" } },
    select: { id: true },
  });
  if (!integration) return NextResponse.json({ syncRuns: [] });

  const syncRuns = await prisma.syncRun.findMany({
    where: { integrationId: integration.id },
    orderBy: { startedAt: "desc" },
    take: 20,
  });

  // E11.4 / A-24: which files each run didn't index, and why (worker recordSkippedFiles).
  const skippedEntries = syncRuns.some((r) => r.filesSkipped > 0)
    ? await prisma.auditLog.findMany({
        where: { orgId, action: AUDIT_EVENTS.SYNC_FILES_SKIPPED, entityType: "SyncRun", entityId: { in: syncRuns.map((r) => r.id) } },
        select: { entityId: true, metadata: true },
      })
    : [];
  const skippedByRun = new Map(skippedEntries.map((e) => [e.entityId, e.metadata?.files || []]));

  return NextResponse.json({
    syncRuns: syncRuns.map((r) => ({ ...r, skippedFiles: skippedByRun.get(r.id) || [] })),
  });
}
