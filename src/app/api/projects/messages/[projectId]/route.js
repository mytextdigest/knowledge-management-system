import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { resolveProjectManagementAccess } from "@/lib/projectManagementPolicy";

export async function GET(req, { params }) {
  try {
    const session = await getServerSession();
    if (!session?.user?.email)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { projectId:projectId } = await params;
    if (!projectId)
      return NextResponse.json({ error: "Missing projectId" }, { status: 400 });

    const { project, user: actingUser, canManage } =
      await resolveProjectManagementAccess(session.user.email, projectId);
    if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (!canManage) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    // Project chat is intentionally per-user. Admins may manage a colleague's
    // project, but they load their own conversation rather than another user's.
    const conv = await prisma.projectConversation.findFirst({
      where: { projectId, userId: actingUser.id },
      orderBy: { createdAt: "desc" },
    });

    if (!conv) return NextResponse.json({ success: true, messages: [] });

    const messages = await prisma.projectMessage.findMany({
      where: { conversationId: conv.id },
      orderBy: { createdAt: "asc" },
    });

    const mapped = messages.map((m) => ({
      id: m.id,
      conversationId: m.conversationId,
      role: m.role,
      content: m.content,
      status: m.status,
      timestamp: m.createdAt,
    }));

    return NextResponse.json({ success: true, messages: mapped });
  } catch (err) {
    console.error("❌ get-project-messages:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
