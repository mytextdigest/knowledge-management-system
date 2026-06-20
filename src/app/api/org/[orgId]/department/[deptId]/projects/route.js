import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveOrgRole } from "@/lib/orgGuard";

export async function GET(req, { params }) {
  const { orgId, deptId } = await params;
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { user, role } = await resolveOrgRole(session.user.email, orgId);
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
  if (!role) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const projects = await prisma.project.findMany({
    where: { orgId, departmentId: deptId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      description: true,
      createdAt: true,
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

export async function POST(req, { params }) {
  const { orgId, deptId } = await params;
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { user, role } = await resolveOrgRole(session.user.email, orgId);
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
  if (!role) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const department = await prisma.department.findUnique({ where: { id: deptId } });
  if (!department || department.orgId !== orgId) {
    return NextResponse.json({ error: "Department not found" }, { status: 404 });
  }

  const body = await req.json();
  const { name, description } = body || {};

  if (!name || typeof name !== "string") {
    return NextResponse.json({ error: "Invalid project name" }, { status: 400 });
  }

  try {
    const project = await prisma.project.create({
      data: {
        name,
        description: description || null,
        userId: user.id,
        orgId,
        departmentId: deptId,
        scope: "org",
      },
    });

    return NextResponse.json({ success: true, id: project.id });
  } catch (err) {
    if (err.code === "P2002") {
      return NextResponse.json(
        {
          error: "PROJECT_ALREADY_EXISTS",
          message: "A project with this name already exists in this department.",
        },
        { status: 409 }
      );
    }

    console.error("Create department project failed:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
