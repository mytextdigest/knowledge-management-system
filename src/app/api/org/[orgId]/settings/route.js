import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { resolveOrgRole } from "@/lib/orgGuard";

export async function GET(req, { params }) {
  const session = await getServerSession();
  if (!session?.user?.email)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { orgId } = await params;
  const { user, role } = await resolveOrgRole(session.user.email, orgId);
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
  if (role !== "super_admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { id: true, name: true, openaiApiKey: true },
  });
  if (!org) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({
    id: org.id,
    name: org.name,
    hasApiKey: !!org.openaiApiKey,
  });
}

export async function PATCH(req, { params }) {
  const session = await getServerSession();
  if (!session?.user?.email)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { orgId } = await params;
  const { user, role } = await resolveOrgRole(session.user.email, orgId);
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
  if (role !== "super_admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const updateData = {};
  if (body.name?.trim()) updateData.name = body.name.trim();
  if ("openaiApiKey" in body) updateData.openaiApiKey = body.openaiApiKey || null;

  if (Object.keys(updateData).length === 0)
    return NextResponse.json({ error: "No changes provided" }, { status: 400 });

  const org = await prisma.organization.update({
    where: { id: orgId },
    data: updateData,
    select: { id: true, name: true },
  });

  return NextResponse.json(org);
}
