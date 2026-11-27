import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { resolveOrgRole, isSuperAdmin } from "@/lib/orgGuard";
import { listTenantGroups, GraphPermissionError } from "@/lib/sso/entraGraph";

// EKP A-6: security groups in the org's connected Microsoft tenant, for the
// group → role mapping picker. super_admin only. ?search= filters by name.
export async function GET(req, { params }) {
  const session = await getServerSession();
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { orgId } = await params;
  const { user, role } = await resolveOrgRole(session.user.email, orgId);
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
  if (!isSuperAdmin(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const config = await prisma.orgSsoConfig.findUnique({ where: { orgId }, select: { tenantId: true } });
  if (!config) return NextResponse.json({ error: "Microsoft sign-in isn't connected" }, { status: 404 });

  const search = new URL(req.url).searchParams.get("search") || "";
  try {
    return NextResponse.json({ groups: await listTenantGroups(config.tenantId, search) });
  } catch (err) {
    const status = err instanceof GraphPermissionError ? 403 : 502;
    return NextResponse.json({ error: err.message, needsReconnect: status === 403 }, { status });
  }
}
