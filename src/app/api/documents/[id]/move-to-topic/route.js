import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { moveDocumentToTopic } from "@/lib/topicUtils";
import { resolveDocumentManagementAccess } from "@/lib/documentManagementPolicy";

export async function POST(req, { params }) {
  const session = await getServerSession();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: docId } = await params;
  const { topicId } = await req.json();

  if (!topicId) {
    return NextResponse.json({ error: "topicId is required" }, { status: 400 });
  }

  const access = await resolveDocumentManagementAccess(session.user.email, docId);
  if (!access.document) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!access.canManage) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const doc = await prisma.document.findUnique({
    where: { id: docId },
    select: { id: true, projectId: true },
  });

  // Verify target topic belongs to the same project
  const topic = await prisma.topic.findFirst({
    where: { id: topicId, projectId: doc.projectId },
    select: { id: true },
  });
  if (!topic) return NextResponse.json({ error: "Topic not found in this project" }, { status: 404 });

  await moveDocumentToTopic(docId, topicId);

  return NextResponse.json({ success: true });
}
