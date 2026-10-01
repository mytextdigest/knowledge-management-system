import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { resolveOrgRole, isSuperAdmin } from "@/lib/orgGuard";
import { listSites } from "@/lib/msGraph";
import { readSetupCookie } from "@/lib/integrationSetup";

// Called by the site-picker UI right after the delegated-consent redirect.
// Lists the org's SharePoint sites (via the short-lived delegated token) and
// this org's departments, so the admin can map one to the other — no raw
// Site IDs or URLs are ever typed by hand.
export async function GET(req, { params }) {
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

  const [sites, departments] = await Promise.all([
    listSites({ accessToken: setup.accessToken }),
    prisma.department.findMany({ where: { orgId }, select: { id: true, name: true } }),
  ]);

  return NextResponse.json({ sites, departments });
}
