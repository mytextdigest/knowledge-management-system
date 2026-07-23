import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { generateSignedUrl } from "@/lib/s3SignedUrl";
import { computeDocumentEmbedding, adjustTopicOnDocumentRemoval } from "@/lib/topicUtils";
import { resolveOrgRole, isOrgAdmin } from "@/lib/orgGuard";

export async function GET(req, { params }) {
  const session = await getServerSession();
  if (!session?.user?.email)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: id } = await params;

  if (!id) return NextResponse.json(null, { status: 400 });

  const doc = await prisma.document.findUnique({
    where: { id },
    include: {
      chunks: { orderBy: { chunkIndex: "asc" } },
      project: { select: { orgId: true, departmentId: true, scope: true } },
      decisions: { orderBy: { decidedAt: "desc" } },
    },
  });

  if (!doc) return NextResponse.json(null, { status: 404 });

  const { user } = await resolveOrgRole(session.user.email, doc.orgId || doc.project?.orgId || "");
  const isOwner = user && doc.userId === user.id;

  if (!isOwner) {
    // Not the uploader — fall back to the same org/department RBAC used by the
    // repository view, since repository/department docs are shared, not private.
    const orgId = doc.orgId || (doc.project?.scope === "org" ? doc.project.orgId : null);
    if (!user || !orgId) return NextResponse.json(null, { status: 404 });

    const { role } = await resolveOrgRole(session.user.email, orgId);
    if (!role) return NextResponse.json(null, { status: 404 });

    if (!isOrgAdmin(role)) {
      if (doc.lifecycle === "draft") return NextResponse.json(null, { status: 404 });

      const departmentId = doc.departmentId ?? doc.project?.departmentId ?? null;
      if (departmentId) {
        const membership = await prisma.departmentMember.findUnique({
          where: { departmentId_userId: { departmentId, userId: user.id } },
        });
        if (!membership) return NextResponse.json(null, { status: 404 });
      }
    }
  }

  let signedUrl = null;
  if (doc.filePath) {
    signedUrl = await generateSignedUrl(doc.filePath);
  }

  const PROCESSING_STATUSES = new Set([
    'queued', 'extracting', 'running_ocr', 'chunked',
    'embedding', 'embedded', 'summarizing', 'clustering',
  ]);

  return NextResponse.json({
    ...doc,
    fileUrl: signedUrl,
    created_at: doc.createdAt.toISOString(),
    permissions: {
      canRegenerate: !!doc.filePath && !PROCESSING_STATUSES.has(doc.status),
      canStar: true,
      canUnassign: true,
    },
  });
}


export async function PATCH(req, { params }) {
  const session = await getServerSession();
  if (!session?.user?.email)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  if (!id) return NextResponse.json({ error: "Missing document id" }, { status: 400 });

  const body = await req.json();
  const { filename } = body;

  if (!filename?.trim()) {
    return NextResponse.json({ error: "Filename is required" }, { status: 400 });
  }

  const doc = await prisma.document.findFirst({
    where: { id, user: { email: session.user.email } },
    select: { id: true },
  });
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const updated = await prisma.document.update({
    where: { id },
    data: { filename: filename.trim() },
    select: { id: true, filename: true },
  });

  return NextResponse.json({ success: true, ...updated });
}

export async function DELETE(req, { params }) {
  const session = await getServerSession();
  if (!session?.user?.email)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  if (!id) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });

  const doc = await prisma.document.findFirst({
    where: { id, user: { email: session.user.email } },
    include: {
      topicDocument: { include: { topic: true } },
    },
  });
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Adjust topic centroid before deleting (topic may be deleted if this was last doc)
  if (doc.topicDocument) {
    try {
      const docEmbedding = await computeDocumentEmbedding(id);
      await adjustTopicOnDocumentRemoval(
        doc.topicDocument.topicId,
        docEmbedding,
        null
      );
    } catch (err) {
      console.error("Failed to adjust topic centroid on document delete:", err.message);
    }
  }

  // Delete document and its relations
  await prisma.$transaction(async (tx) => {
    await tx.message.deleteMany({ where: { conversation: { documentId: id } } });
    await tx.conversation.deleteMany({ where: { documentId: id } });
    await tx.chunk.deleteMany({ where: { documentId: id } });
    await tx.document.delete({ where: { id } });
  });

  return NextResponse.json({ success: true });
}
