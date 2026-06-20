import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { resolveOrgRole } from "@/lib/orgGuard";

export async function GET(req, { params }) {
  const session = await getServerSession();
  if (!session?.user?.email)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { orgId, userId } = await params;
  const { user, role } = await resolveOrgRole(session.user.email, orgId);
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
  if (role !== "super_admin")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const memberships = await prisma.departmentMember.findMany({
    where: { userId, role: "admin", department: { orgId } },
    select: { departmentId: true },
  });

  return NextResponse.json({ departmentIds: memberships.map((m) => m.departmentId) });
}

export async function PUT(req, { params }) {
  const session = await getServerSession();
  if (!session?.user?.email)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { orgId, userId } = await params;
  const { user, role } = await resolveOrgRole(session.user.email, orgId);
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
  if (role !== "super_admin")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const target = await prisma.organizationMember.findUnique({
    where: { orgId_userId: { orgId, userId } },
  });
  if (!target) return NextResponse.json({ error: "Member not found" }, { status: 404 });

  const { departmentIds } = await req.json();
  if (!Array.isArray(departmentIds))
    return NextResponse.json({ error: "departmentIds must be an array" }, { status: 400 });

  const validCount = await prisma.department.count({
    where: { id: { in: departmentIds }, orgId },
  });
  if (validCount !== departmentIds.length)
    return NextResponse.json({ error: "Invalid department selection" }, { status: 400 });

  const current = await prisma.departmentMember.findMany({
    where: { userId, role: "admin", department: { orgId } },
    select: { departmentId: true },
  });
  const currentIds = current.map((m) => m.departmentId);

  const toAdd = departmentIds.filter((id) => !currentIds.includes(id));
  const toRemove = currentIds.filter((id) => !departmentIds.includes(id));

  await prisma.$transaction([
    ...toAdd.map((departmentId) =>
      prisma.departmentMember.upsert({
        where: { departmentId_userId: { departmentId, userId } },
        update: { role: "admin" },
        create: { departmentId, userId, role: "admin" },
      })
    ),
    ...toRemove.map((departmentId) =>
      prisma.departmentMember.delete({
        where: { departmentId_userId: { departmentId, userId } },
      })
    ),
  ]);

  return NextResponse.json({ departmentIds });
}
