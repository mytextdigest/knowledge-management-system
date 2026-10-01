import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveOrgRole } from "@/lib/orgGuard";

export async function GET(req, { params }) {
  const { orgId } = await params;
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { user, role } = await resolveOrgRole(session.user.email, orgId);
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
  if (!role) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Org-wide read-only listing, across every department, for the org
  // Projects overview page. Creation always goes through the
  // department-scoped route (/api/org/[orgId]/department/[deptId]/projects)
  // since every project must belong to a department.
  const projects = await prisma.project.findMany({
    where: { orgId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      description: true,
      createdAt: true,
      department: { select: { id: true, name: true } },
      user: { select: { name: true, email: true } },
    },
  });

  return NextResponse.json(
    projects.map((p) => ({
      ...p,
      created_at: p.createdAt.toISOString(),
    }))
  );
}
