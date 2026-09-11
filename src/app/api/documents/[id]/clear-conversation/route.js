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

    const access = await resolveDocumentManagementAccess(session.user.email, documentId);
    if (!access.document)
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    if (!access.canManage)
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const actingUser = access.user || await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true },
    });
    if (!actingUser)
      return NextResponse.json({ error: "User not found" }, { status: 404 });

    // Find the caller's active conversation for this shared document.
    const conv = await prisma.conversation.findFirst({
      where: { documentId, userId: actingUser.id },
      orderBy: { createdAt: "desc" }
    });

    if (!conv) {
      const newConv = await prisma.conversation.create({
        data: { documentId, userId: actingUser.id }
      });
      return NextResponse.json({ success: true, conversationId: newConv.id });
    }

    // 🔥 DELETE messages (this is the actual clear)
    await prisma.message.deleteMany({
      where: { conversationId: conv.id }
    });

    return NextResponse.json({
      success: true,
      conversationId: conv.id
    });

  } catch (err) {
    console.error("clear-conversation error:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
