import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { resolveDocumentManagementAccess } from "@/lib/documentManagementPolicy";

export async function POST(req, { params }) {
  try {
    const session = await getServerSession();
    if (!session?.user?.email)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id: documentId } = await params;

    console.log("Conv document id: ", documentId)

    const access = await resolveDocumentManagementAccess(session.user.email, documentId);
    if (!access.document) return NextResponse.json({ error: "Document not found" }, { status: 404 });
    if (!access.canManage) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const actingUser = access.user || await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true },
    });
    if (!actingUser) return NextResponse.json({ error: "User not found" }, { status: 404 });

    // Check for the caller's existing conversation
    const existing = await prisma.conversation.findFirst({
      where: {
        documentId,
        userId: actingUser.id,
        messages: { some: {} } // must still have messages
      },
      orderBy: { createdAt: "desc" }
    });

    if (existing) {
      return NextResponse.json({
        success: true,
        conversationId: existing.id
      });
    }

    // Create new conversation
    const conv = await prisma.conversation.create({
      data: {
        documentId,
        userId: actingUser.id  // caller-specific conversation
      }
    });

    return NextResponse.json({
      success: true,
      conversationId: conv.id
    });

  } catch (err) {
    console.error("start-conversation error:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
