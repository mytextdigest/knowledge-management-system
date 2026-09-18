import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { resolveOrgRole, isSuperAdmin } from "@/lib/orgGuard";
import { logAudit } from "@/lib/auditLog";

async function loadDepartment(orgId, deptId) {
  return prisma.department.findFirst({ where: { id: deptId, orgId } });
}

export async function PATCH(req, { params }) {
  const session = await getServerSession();
  if (!session?.user?.email)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { orgId, deptId } = await params;
  const { user, role } = await resolveOrgRole(session.user.email, orgId);
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
  if (!isSuperAdmin(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const department = await loadDepartment(orgId, deptId);
  if (!department) return NextResponse.json({ error: "Department not found" }, { status: 404 });

  const name = (await req.json())?.name?.trim();
  if (!name) return NextResponse.json({ error: "Department name is required" }, { status: 400 });

  if (name !== department.name) {
    const existing = await prisma.department.findFirst({ where: { orgId, name } });
    if (existing) return NextResponse.json({ error: "Department already exists" }, { status: 400 });
  }

  const updated = await prisma.department.update({
    where: { id: deptId },
    data: { name },
    include: { _count: { select: { members: true, documents: true } } },
  });

  await logAudit({
    orgId,
    actorUserId: user.id,
    action: "department_renamed",
    metadata: { departmentId: deptId, from: department.name, to: name },
  });

  return NextResponse.json(updated);
}

export async function DELETE(req, { params }) {
  const session = await getServerSession();
  if (!session?.user?.email)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { orgId, deptId } = await params;
  const { user, role } = await resolveOrgRole(session.user.email, orgId);
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
  if (!isSuperAdmin(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const department = await loadDepartment(orgId, deptId);
  if (!department) return NextResponse.json({ error: "Department not found" }, { status: 404 });

  const { searchParams } = new URL(req.url);
  const confirmed = searchParams.get("confirm") === "true";

  const [members, projects, documents] = await Promise.all([
    prisma.departmentMember.count({ where: { departmentId: deptId } }),
    prisma.project.count({ where: { departmentId: deptId } }),
    prisma.document.count({ where: { departmentId: deptId } }),
  ]);
  const counts = { members, projects, documents };
  const isEmpty = members === 0 && projects === 0 && documents === 0;

  if (!isEmpty && !confirmed) {
    return NextResponse.json(
      {
        error: "Department is not empty",
        requiresConfirmation: true,
        counts,
        message:
          `This department has ${members} member(s), ${projects} project(s), and ${documents} document(s). ` +
          `Deleting it will remove its members and projects, and its documents will become org-wide (unassigned to any department). ` +
          `Confirm to proceed.`,
      },
      { status: 409 }
    );
  }

  await prisma.department.delete({ where: { id: deptId } });

  await logAudit({
    orgId,
    actorUserId: user.id,
    action: "department_deleted",
    metadata: { departmentId: deptId, name: department.name, counts },
  });

  return NextResponse.json({ success: true, counts });
}
