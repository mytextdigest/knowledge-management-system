import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { resolveOrgRole, isSuperAdmin } from "@/lib/orgGuard";

// Known connectors (FR-1's abstraction) — add an entry here as each new
// provider's dedicated page ships. Purely a display registry; nothing here
// gates which providers can actually connect.
const KNOWN_PROVIDERS = [{ provider: "sharepoint", displayName: "SharePoint" }];

// Backs the Settings "Integrations" tab — one row per known provider, cross-
// referenced against what's actually connected for this org.
export async function GET(req, { params }) {
  const session = await getServerSession();
  if (!session?.user?.email)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { orgId } = await params;
  const { user, role } = await resolveOrgRole(session.user.email, orgId);
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
  if (!isSuperAdmin(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const rows = await prisma.orgIntegration.findMany({
    where: { orgId },
    select: { provider: true, status: true, lastSyncAt: true, scopeConfig: true },
  });
  const byProvider = Object.fromEntries(rows.map((r) => [r.provider, r]));

  const integrations = KNOWN_PROVIDERS.map(({ provider, displayName }) => {
    const row = byProvider[provider];
    return {
      provider,
      displayName,
      connected: row?.status === "connected",
      status: row?.status || "not_connected",
      siteCount: row?.scopeConfig?.sites?.length || 0,
      lastSyncAt: row?.lastSyncAt || null,
    };
  });

  return NextResponse.json({ integrations });
}
