import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { resolveOrgRole, isSuperAdmin } from "@/lib/orgGuard";

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

  return NextResponse.json({ syncRuns });
}
