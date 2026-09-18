import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { resolveOrgRole, canManageDepartment } from "@/lib/orgGuard";

export async function DELETE(req, { params }) {
  const session = await getServerSession();
  if (!session?.user?.email)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { orgId, deptId, userId } = await params;
  const { user, role } = await resolveOrgRole(session.user.email, orgId);
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
  if (!role) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const department = await prisma.department.findFirst({ where: { id: deptId, orgId } });
  if (!department) return NextResponse.json({ error: "Department not found" }, { status: 404 });

  if (!(await canManageDepartment(role, deptId, user.id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await prisma.departmentMember.deleteMany({
    where: { departmentId: deptId, userId },
  });

  return NextResponse.json({ success: true });
}
