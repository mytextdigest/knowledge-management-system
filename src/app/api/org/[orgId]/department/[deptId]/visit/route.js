import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { resolveOrgRole } from "@/lib/orgGuard";

export async function POST(req, { params }) {
  const { orgId, deptId } = await params;
  const session = await getServerSession();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { user, role } = await resolveOrgRole(session.user.email, orgId);
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
  if (!role) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const department = await prisma.department.findFirst({ where: { id: deptId, orgId } });
  if (!department) {
    return NextResponse.json({ error: "Department not found" }, { status: 404 });
  }

  await prisma.organizationMember.update({
    where: { orgId_userId: { orgId, userId: user.id } },
    data: { lastDepartmentId: deptId },
  });

  return NextResponse.json({ success: true });
}
