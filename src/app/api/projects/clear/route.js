import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { resolveProjectManagementAccess } from "@/lib/projectManagementPolicy";

export async function POST(req) {
  try {
    const session = await getServerSession();
    if (!session?.user?.email)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { projectId } = await req.json();
    if (!projectId)
      return NextResponse.json({ error: "Missing projectId" }, { status: 400 });

    const { project, user: actingUser, canManage } =
      await resolveProjectManagementAccess(session.user.email, projectId);
    if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
    if (!canManage) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    // Clear only the caller's project chat, not another manager's conversation.
    const conversations = await prisma.projectConversation.findMany({
      where: { projectId, userId: actingUser.id },
      select: { id: true },
    });

    if (!conversations.length) return NextResponse.json({ success: true });

    const ids = conversations.map((c) => c.id);

    await prisma.projectMessage.deleteMany({
      where: { conversationId: { in: ids } },
    });

    await prisma.projectConversation.deleteMany({
      where: { id: { in: ids } },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("❌ clear-project-chat:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
