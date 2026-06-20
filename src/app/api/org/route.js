import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession();
  if (!session?.user?.email)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true },
  });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const memberships = await prisma.organizationMember.findMany({
    where: { userId: user.id },
    include: { organization: { select: { id: true, name: true } } },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json(
    memberships.map((m) => ({
      id: m.organization.id,
      name: m.organization.name,
      role: m.role,
    }))
  );
}

export async function POST(req) {
  const session = await getServerSession();
  if (!session?.user?.email)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true },
  });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const { name } = await req.json();
  if (!name?.trim())
    return NextResponse.json({ error: "Organization name is required" }, { status: 400 });

  const org = await prisma.organization.create({ data: { name: name.trim() } });
  // Slack creates a default #general channel for every new workspace —
  // mirror that with a default department so a new org is never empty.
  const defaultDept = await prisma.department.create({
    data: { orgId: org.id, name: "General" },
  });
  await prisma.organizationMember.create({
    data: { orgId: org.id, userId: user.id, role: "super_admin", lastDepartmentId: defaultDept.id },
  });

  return NextResponse.json({ id: org.id, name: org.name, role: "super_admin" }, { status: 201 });
}
