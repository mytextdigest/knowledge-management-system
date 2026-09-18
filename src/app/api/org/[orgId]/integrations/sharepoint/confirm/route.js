import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { resolveOrgRole, isSuperAdmin } from "@/lib/orgGuard";
import { grantSitePermission, getAppOnlyToken } from "@/lib/msGraph";
import { encrypt } from "@/lib/crypto";
import { readSetupCookie, clearSetupCookie } from "@/lib/integrationSetup";

const APP_DISPLAY_NAME = "KMS SharePoint Connector";

// Finalizes the connect flow (FR-2): grants the shared app's Sites.Selected
// access to each chosen site (still using the one-time delegated token),
// mints the ongoing app-only token, and persists OrgIntegration. The
// delegated token is discarded after this — never stored.
export async function POST(req, { params }) {
  const session = await getServerSession();
  if (!session?.user?.email)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { orgId } = await params;
  const { user, role } = await resolveOrgRole(session.user.email, orgId);
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
  if (!isSuperAdmin(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const setup = await readSetupCookie(orgId);
  if (!setup) {
    return NextResponse.json(
      { error: "No active SharePoint connect session — click Connect SharePoint again." },
      { status: 409 }
    );
  }

  const body = await req.json().catch(() => null);
  const selections = Array.isArray(body?.selections) ? body.selections : [];
  if (selections.length === 0) {
    return NextResponse.json({ error: "Select at least one site" }, { status: 400 });
  }
  for (const s of selections) {
    if (!s.siteId || !s.departmentId) {
      return NextResponse.json({ error: "Each selection needs siteId and departmentId" }, { status: 400 });
    }
  }

  // Defense in depth: the picker only offers this org's departments, but
  // don't trust the client alone — confirm server-side too.
  const departmentIds = [...new Set(selections.map((s) => s.departmentId))];
  const validDepartments = await prisma.department.findMany({
    where: { id: { in: departmentIds }, orgId },
    select: { id: true },
  });
  if (validDepartments.length !== departmentIds.length) {
    return NextResponse.json({ error: "One or more departments do not belong to this org" }, { status: 400 });
  }

  const appId = process.env.MSGRAPH_CLIENT_ID;
  for (const s of selections) {
    await grantSitePermission({
      accessToken: setup.accessToken,
      siteId: s.siteId,
      appId,
      appDisplayName: APP_DISPLAY_NAME,
    });
  }

  const { accessToken: appOnlyToken, expiresIn } = await getAppOnlyToken(setup.tenantId);

  // Merge into any already-connected sites (the "Connect another site" path
  // re-enters this same route) rather than overwriting — otherwise a second
  // connect would silently drop previously connected sites from scopeConfig.
  const existing = await prisma.orgIntegration.findUnique({
    where: { orgId_provider: { orgId, provider: "sharepoint" } },
    select: { scopeConfig: true },
  });
  const existingSites = existing?.scopeConfig?.sites || [];
  const sitesById = new Map(existingSites.map((s) => [s.siteId, s]));
  for (const s of selections) {
    sitesById.set(s.siteId, {
      siteId: s.siteId,
      siteUrl: s.siteUrl || null,
      departmentId: s.departmentId,
      // Preserve an already-syncing site's cursor if it's just being
      // re-confirmed (e.g. department reassignment) — only a genuinely new
      // site starts with no cursor.
      lastSyncCursor: sitesById.get(s.siteId)?.lastSyncCursor ?? null,
    });
  }

  const scopeConfig = {
    tenantId: setup.tenantId,
    connectedByUserId: user.id,
    sites: [...sitesById.values()],
  };

  const integration = await prisma.orgIntegration.upsert({
    where: { orgId_provider: { orgId, provider: "sharepoint" } },
    create: {
      orgId,
      provider: "sharepoint",
      status: "connected",
      scopeConfig,
      accessToken: encrypt(appOnlyToken),
      tokenExpiry: new Date(Date.now() + expiresIn * 1000),
    },
    update: {
      status: "connected",
      scopeConfig,
      accessToken: encrypt(appOnlyToken),
      tokenExpiry: new Date(Date.now() + expiresIn * 1000),
    },
    select: { id: true, provider: true, status: true, scopeConfig: true, createdAt: true },
  });

  await clearSetupCookie();

  return NextResponse.json({ integration });
}
