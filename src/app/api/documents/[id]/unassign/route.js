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

  const access = await resolveDocumentManagementAccess(session.user.email, docId);
  if (!access.document) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!access.canManage) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // moveDocumentToTopic with null newTopicId = unassign
  await moveDocumentToTopic(docId, null);

  return NextResponse.json({ success: true });
}
