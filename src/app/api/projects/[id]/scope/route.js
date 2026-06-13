import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { resolveOrgRole, isSuperAdmin } from "@/lib/orgGuard";

export async function PATCH(req, { params }) {
  const session = await getServerSession();
  if (!session?.user?.email)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const { scope, orgId } = body;

  if (scope !== "org" || !orgId?.trim())
    return NextResponse.json(
      { error: "scope must be 'org' and orgId is required" },
      { status: 400 }
    );

  const { user, role } = await resolveOrgRole(session.user.email, orgId);
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
  if (!isSuperAdmin(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const project = await prisma.project.findFirst({
    where: { id },
    select: { id: true },
  });
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const updated = await prisma.project.update({
    where: { id },
    data: { scope: "org", orgId },
    select: { id: true, name: true, scope: true, orgId: true },
  });

  return NextResponse.json(updated);
}
