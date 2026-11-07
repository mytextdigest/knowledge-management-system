import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { resolveOrgRole } from "@/lib/orgGuard";

const VALID_ROLES = ["super_admin", "dept_admin", "employee", "guest"];

export async function PATCH(req, { params }) {
  const session = await getServerSession();
  if (!session?.user?.email)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { orgId, userId } = await params;
  const { user, role: callerRole } = await resolveOrgRole(session.user.email, orgId);
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
  if (callerRole !== "super_admin")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { role } = await req.json();
  if (!VALID_ROLES.includes(role))
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });

  const target = await prisma.organizationMember.findUnique({
    where: { orgId_userId: { orgId, userId } },
  });
  if (!target) return NextResponse.json({ error: "Member not found" }, { status: 404 });

  if (target.role === "super_admin" && role !== "super_admin") {
    const superAdminCount = await prisma.organizationMember.count({
      where: { orgId, role: "super_admin" },
    });
    if (superAdminCount <= 1)
      return NextResponse.json(
        { error: "Cannot demote the only Super Admin. Promote another member first." },
        { status: 400 }
      );
  }

  const updated = await prisma.organizationMember.update({
    where: { orgId_userId: { orgId, userId } },
    data: { role },
  });

  return NextResponse.json({ userId, role: updated.role });
}

export async function DELETE(req, { params }) {
  const session = await getServerSession();
  if (!session?.user?.email)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { orgId, userId } = await params;
  const { user, role: callerRole } = await resolveOrgRole(session.user.email, orgId);
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
  if (callerRole !== "super_admin")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const target = await prisma.organizationMember.findUnique({
    where: { orgId_userId: { orgId, userId } },
  });
  if (!target) return NextResponse.json({ error: "Member not found" }, { status: 404 });

  if (target.role === "super_admin") {
    const superAdminCount = await prisma.organizationMember.count({
      where: { orgId, role: "super_admin" },
    });
    if (superAdminCount <= 1)
      return NextResponse.json(
        { error: "Cannot remove the only Super Admin. Promote another member first." },
        { status: 400 }
      );
  }

  await prisma.$transaction([
    prisma.departmentMember.deleteMany({
      where: { userId, department: { orgId } },
    }),
    prisma.organizationMember.delete({
      where: { orgId_userId: { orgId, userId } },
    }),
  ]);

  return NextResponse.json({ ok: true });
}
