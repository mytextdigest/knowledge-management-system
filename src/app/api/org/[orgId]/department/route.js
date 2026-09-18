import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { resolveOrgRole, isOrgAdmin } from "@/lib/orgGuard";

export async function GET(req, { params }) {
  const session = await getServerSession();

  if (!session?.user?.email) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  const { orgId } = await params;

  const { user, role } = await resolveOrgRole(
    session.user.email,
    orgId
  );

  if (!user) {
    return NextResponse.json(
      { error: "User not found" },
      { status: 404 }
    );
  }

  if (!role) {
    return NextResponse.json(
      { error: "Forbidden" },
      { status: 403 }
    );
  }

  const { searchParams } = new URL(req.url);
  const mineOnly = searchParams.get("mine") === "1" || searchParams.get("mine") === "true";

  const departments = await prisma.department.findMany({
    where: {
      orgId,
      ...(mineOnly ? { members: { some: { userId: user.id } } } : {}),
    },
    include: {
      _count: {
        select: {
          members: true,
          documents: true,
        },
      },
    },
    orderBy: {
      name: "asc",
    },
  });

  return NextResponse.json(departments);
}

export async function POST(req, { params }) {
  const session = await getServerSession();

  if (!session?.user?.email) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  const { orgId } = await params;

  const { user, role } = await resolveOrgRole(
    session.user.email,
    orgId
  );

  if (!user) {
    return NextResponse.json(
      { error: "User not found" },
      { status: 404 }
    );
  }

  if (!isOrgAdmin(role)) {
    return NextResponse.json(
      { error: "Forbidden" },
      { status: 403 }
    );
  }

  const body = await req.json();
  const name = body.name?.trim();

  if (!name) {
    return NextResponse.json(
      { error: "Department name is required" },
      { status: 400 }
    );
  }

  const existing = await prisma.department.findFirst({
    where: {
      orgId,
      name,
    },
  });

  if (existing) {
    return NextResponse.json(
      { error: "Department already exists" },
      { status: 400 }
    );
  }

  const department = await prisma.$transaction(async (tx) => {
    const created = await tx.department.create({
      data: {
        orgId,
        name,
      },
      include: {
        _count: {
          select: {
            members: true,
            documents: true,
          },
        },
      },
    });

    // super_admin gets implicit access to every department; a dept_admin
    // creator needs an explicit membership or canManageDepartment() will
    // 403 them on the department they just created.
    if (role === "dept_admin") {
      await tx.departmentMember.upsert({
        where: { departmentId_userId: { departmentId: created.id, userId: user.id } },
        update: { role: "admin" },
        create: { departmentId: created.id, userId: user.id, role: "admin" },
      });
    }

    return created;
  });

  return NextResponse.json(department);
}