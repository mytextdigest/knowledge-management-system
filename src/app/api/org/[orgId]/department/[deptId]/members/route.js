import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { resolveOrgRole, canManageDepartment } from "@/lib/orgGuard";

async function loadDepartment(orgId, deptId) {
  return prisma.department.findFirst({ where: { id: deptId, orgId } });
}

export async function GET(req, { params }) {
  const session = await getServerSession();
  if (!session?.user?.email)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { orgId, deptId } = await params;
  const { user, role } = await resolveOrgRole(session.user.email, orgId);
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
  if (!role) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const department = await loadDepartment(orgId, deptId);
  if (!department) return NextResponse.json({ error: "Department not found" }, { status: 404 });

  const members = await prisma.departmentMember.findMany({
    where: { departmentId: deptId },
    include: { user: { select: { id: true, name: true, email: true } } },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json(
    members.map((m) => ({
      id: m.id,
      userId: m.userId,
      name: m.user.name,
      email: m.user.email,
      role: m.role,
    }))
  );
}

export async function POST(req, { params }) {
  const session = await getServerSession();
  if (!session?.user?.email)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { orgId, deptId } = await params;
  const { user, role } = await resolveOrgRole(session.user.email, orgId);
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
  if (!role) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const department = await loadDepartment(orgId, deptId);
  if (!department) return NextResponse.json({ error: "Department not found" }, { status: 404 });

  if (!(await canManageDepartment(role, deptId, user.id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const email = body.email?.trim();
  const memberRole = body.role === "admin" ? "admin" : "member";

  if (!email) {
    return NextResponse.json({ error: "Email is required" }, { status: 400 });
  }

  const targetUser = await prisma.user.findUnique({ where: { email } });
  if (!targetUser) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const orgMembership = await prisma.organizationMember.findUnique({
    where: { orgId_userId: { orgId, userId: targetUser.id } },
  });
  if (!orgMembership) {
    return NextResponse.json(
      { error: "User is not a member of this organization" },
      { status: 400 }
    );
  }

  const member = await prisma.departmentMember.upsert({
    where: { departmentId_userId: { departmentId: deptId, userId: targetUser.id } },
    update: { role: memberRole },
    create: { departmentId: deptId, userId: targetUser.id, role: memberRole },
    include: { user: { select: { id: true, name: true, email: true } } },
  });

  return NextResponse.json({
    id: member.id,
    userId: member.userId,
    name: member.user.name,
    email: member.user.email,
    role: member.role,
  });
}
