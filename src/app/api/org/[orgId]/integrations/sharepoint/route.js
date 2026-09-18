import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { resolveOrgRole, isSuperAdmin } from "@/lib/orgGuard";

// Current connection status for the settings UI — used to render "connect"
// vs "already connected, here's what's mapped" without re-running OAuth.
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
    select: { id: true, status: true, scopeConfig: true, lastSyncAt: true, createdAt: true },
  });

  if (!integration) return NextResponse.json({ connected: false });

  const sites = integration.scopeConfig?.sites || [];
  const departmentIds = sites.map((s) => s.departmentId);
  const departments = await prisma.department.findMany({
    where: { id: { in: departmentIds } },
    select: { id: true, name: true },
  });
  const deptNameById = Object.fromEntries(departments.map((d) => [d.id, d.name]));

  return NextResponse.json({
    // "connected" reflects the actual current status, not just "a row
    // exists" — a disconnected integration keeps its row (scopeConfig, sync
    // history) around for a possible reconnect, but isn't connected.
    connected: integration.status === "connected",
    status: integration.status,
    lastSyncAt: integration.lastSyncAt,
    connectedAt: integration.createdAt,
    sites: sites.map((s) => ({
      siteId: s.siteId,
      siteUrl: s.siteUrl,
      departmentId: s.departmentId,
      departmentName: deptNameById[s.departmentId] || null,
    })),
  });
}

// Disconnect: stops future syncs (POST .../sync already rejects anything
// whose status isn't "connected") and marks the row disconnected. Doesn't
// delete OrgIntegration — scopeConfig/SyncRun history stay around in case
// of a reconnect. Note: this does not revoke the Sites.Selected grant on
// the Microsoft side (that needs a fresh delegated admin session, same as
// connecting) — disconnecting here only stops KMS from syncing.
export async function DELETE(req, { params }) {
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
  if (!integration) return NextResponse.json({ error: "Not connected" }, { status: 404 });

  await prisma.orgIntegration.update({
    where: { id: integration.id },
    data: { status: "disconnected" },
  });

  return NextResponse.json({ disconnected: true });
}
