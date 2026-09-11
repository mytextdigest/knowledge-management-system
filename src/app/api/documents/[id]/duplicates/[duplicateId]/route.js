import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { resolveOrgRole, isOrgAdmin } from "@/lib/orgGuard";

export async function PATCH(req, { params }) {
  const session = await getServerSession();
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id, duplicateId } = await params;
  const body = await req.json();
  if (!["confirmed", "dismissed", "pending"].includes(body?.status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const doc = await prisma.document.findUnique({
    where: { id },
    select: { userId: true, orgId: true, project: { select: { orgId: true } } },
  });
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { user, role } = await resolveOrgRole(session.user.email, doc.orgId || doc.project?.orgId || "");
  if (!user || (!isOrgAdmin(role) && doc.userId !== user.id)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const result = await prisma.documentDuplicate.updateMany({
    where: { id: duplicateId, documentId: id },
    data: { status: body.status },
  });
  if (!result.count) return NextResponse.json({ error: "Duplicate signal not found" }, { status: 404 });
  return NextResponse.json({ success: true, status: body.status });
}
