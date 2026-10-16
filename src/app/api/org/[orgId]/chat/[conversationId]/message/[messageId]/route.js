import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { resolveOrgRole } from "@/lib/orgGuard";

const ALLOWED_FEEDBACK = new Set(["up", "down"]);

export async function PATCH(req, { params }) {
  const session = await getServerSession();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { orgId, conversationId, messageId } = await params;
  const { user, role } = await resolveOrgRole(session.user.email, orgId);
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
  if (!role) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const feedback = body.feedback === null ? null : String(body.feedback || "").toLowerCase();
  if (feedback !== null && !ALLOWED_FEEDBACK.has(feedback)) {
    return NextResponse.json({ error: "Feedback must be up, down, or null" }, { status: 400 });
  }

  const message = await prisma.orgMessage.findFirst({
    where: {
      id: messageId,
      conversationId,
      role: "assistant",
      conversation: { id: conversationId, orgId, userId: user.id },
    },
    select: { id: true },
  });

  if (!message) {
    return NextResponse.json({ error: "Assistant message not found" }, { status: 404 });
  }

  const updated = await prisma.orgMessage.update({
    where: { id: messageId },
    data: { feedback },
    select: { id: true, feedback: true },
  });

  return NextResponse.json(updated);
}
