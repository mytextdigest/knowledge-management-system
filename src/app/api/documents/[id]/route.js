import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { generateSignedUrl, generateSignedDownloadUrl } from "@/lib/s3SignedUrl";
import { computeDocumentEmbedding, adjustTopicOnDocumentRemoval } from "@/lib/topicUtils";
import { resolveOrgRole, isOrgAdmin, isSuperAdmin, canManageDepartment } from "@/lib/orgGuard";
import { filterAccessibleDocuments } from "@/lib/documentAccess";
import { getAccessibleRelatedDocuments } from "@/lib/knowledgeContext";
import { resolveDocumentManagementAccess } from "@/lib/documentManagementPolicy";

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
      conflictsAsDocA: {
        orderBy: { createdAt: "desc" },
        include: {
          documentB: { select: { id: true, filename: true, userId: true, departmentId: true, lifecycle: true } },
        },
      },
      projectLinks: {
        where: { status: { in: ["suggested", "confirmed"] } },
        include: { project: { select: { id: true, name: true } } },
        orderBy: { confidence: "desc" },
      },
      conflictsAsDocB: {
        orderBy: { createdAt: "desc" },
        include: {
          documentA: { select: { id: true, filename: true, userId: true, departmentId: true, lifecycle: true } },
        },
      },
    },
  });

  if (!doc) return NextResponse.json(null, { status: 404 });

  const { user, role: ownerOrgRole } = await resolveOrgRole(
    session.user.email,
    doc.orgId || doc.project?.orgId || ""
  );
  const isOwner = user && doc.userId === user.id;
  let role = isOwner ? ownerOrgRole : null;

  if (!isOwner) {
    // Not the uploader — fall back to the same org/department RBAC used by the
    // repository view, since repository/department docs are shared, not private.
    const orgId = doc.orgId || (doc.project?.scope === "org" ? doc.project.orgId : null);
    if (!user || !orgId) return NextResponse.json(null, { status: 404 });

    const resolved = await resolveOrgRole(session.user.email, orgId);
    role = resolved.role;
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
  let downloadUrl = null;
  if (doc.filePath) {
    [signedUrl, downloadUrl] = await Promise.all([
      generateSignedUrl(doc.filePath),
      generateSignedDownloadUrl(doc.filePath, doc.filename || "document"),
    ]);
  }

  const PROCESSING_STATUSES = new Set([
    'queued', 'extracting', 'running_ocr', 'chunked',
    'embedding', 'embedded', 'summarizing', 'clustering',
  ]);

  const rawConflicts = [
    ...doc.conflictsAsDocA.map((c) => ({
      id: c.id,
      summary: c.summary,
      status: c.status,
      createdAt: c.createdAt,
      otherDocument: c.documentB,
    })),
    ...doc.conflictsAsDocB.map((c) => ({
      id: c.id,
      summary: c.summary,
      status: c.status,
      createdAt: c.createdAt,
      otherDocument: c.documentA,
    })),
  ];

  // A conflict pairs two documents that share a department or project, but
  // that doesn't guarantee *this* viewer can open both sides (e.g. a private,
  // multi-owner project) — drop any conflict whose other document this user
  // isn't otherwise allowed to see, same check used for timeline lists.
  const accessibleOtherDocs = user
    ? await filterAccessibleDocuments(
        rawConflicts.map((c) => c.otherDocument),
        { userId: user.id, role }
      )
    : [];
  const accessibleOtherDocIds = new Set(accessibleOtherDocs.map((d) => d.id));

  const conflicts = rawConflicts
    .filter((c) => accessibleOtherDocIds.has(c.otherDocument.id))
    .map((c) => ({
      ...c,
      otherDocument: { id: c.otherDocument.id, filename: c.otherDocument.filename },
    }))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const relatedDocuments = user
    ? await getAccessibleRelatedDocuments({
        documentId: doc.id,
        orgId: doc.orgId || doc.project?.orgId || "",
        userId: user.id,
        isSuperAdmin: isSuperAdmin(role),
      })
    : [];

  const effectiveDepartmentId = doc.departmentId ?? doc.project?.departmentId ?? null;
  const canManage =
    Boolean(isOwner) ||
    isSuperAdmin(role) ||
    (role === "dept_admin" &&
      Boolean(user?.id) &&
      Boolean(effectiveDepartmentId) &&
      (await canManageDepartment(role, effectiveDepartmentId, user.id)));

  const { conflictsAsDocA, conflictsAsDocB, ...docWithoutRawConflicts } = doc;

  return NextResponse.json({
    ...docWithoutRawConflicts,
    conflicts,
    relatedDocuments,
    fileUrl: signedUrl,
    fileDownloadUrl: downloadUrl,
    created_at: doc.createdAt.toISOString(),
    permissions: {
      canManage,
      canRegenerate: canManage && !!doc.filePath && !PROCESSING_STATUSES.has(doc.status),
      canAsk: canManage,
      canClearChat: canManage,
      canStar: canManage,
      canRename: canManage,
      canDelete: canManage,
      canUnassign: canManage,
      canMoveToTopic: canManage,
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

  const access = await resolveDocumentManagementAccess(session.user.email, id);
  if (!access.document) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!access.canManage) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

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

  const access = await resolveDocumentManagementAccess(session.user.email, id);
  if (!access.document) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!access.canManage) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const doc = await prisma.document.findUnique({
    where: { id },
    include: {
      topicDocument: { include: { topic: true } },
    },
  });

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
