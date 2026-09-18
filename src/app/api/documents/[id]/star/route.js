import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { resolveDocumentManagementAccess } from "@/lib/documentManagementPolicy";

export async function PATCH(req, { params }) {
  try {
    const session = await getServerSession();
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id:docId } = await params;
    if (!docId) {
      return NextResponse.json({ error: "Invalid document ID" }, { status: 400 });
    }

    const access = await resolveDocumentManagementAccess(session.user.email, docId);
    if (!access.document) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }
    if (!access.canManage) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const doc = await prisma.document.findUnique({
      where: { id: docId },
      select: { id: true, starred: true },
    });

    const newStarred = doc.starred === 1 ? 0 : 1;

    // Toggle in DB
    await prisma.document.update({
      where: { id: doc.id },
      data: { starred: newStarred },
    });

    return NextResponse.json({ success: true, starred: newStarred });
  } catch (err) {
    console.error("Failed to toggle star:", err);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
