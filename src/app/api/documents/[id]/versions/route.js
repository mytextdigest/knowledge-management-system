import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { resolveDocumentManagementAccess } from "@/lib/documentManagementPolicy";

export async function GET(_req, { params }) {
  const session = await getServerSession();
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const access = await resolveDocumentManagementAccess(session.user.email, id);
  if (!access.document || !access.canManage) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const doc = await prisma.document.findUnique({ where: { id }, select: { deletedAt: true } });
  if (doc?.deletedAt) return NextResponse.json({ error: "Deleted document" }, { status: 409 });
  const versions = await prisma.documentVersion.findMany({
    where: { documentId: id }, orderBy: { versionNumber: "desc" }, take: 100,
    select: { id: true, versionNumber: true, filename: true, status: true, createdAt: true, createdById: true, content: true, summary: true },
  });
  return NextResponse.json({ versions });
}
