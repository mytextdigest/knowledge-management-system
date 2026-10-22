import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { AUDIT_EVENTS } from "@/lib/audit/events";
import { getSetting } from "@/lib/settings";
import { calculatePurgeAfter } from "@/lib/lifecycle/softDelete.mjs";
import { generateSignedUrl, generateSignedDownloadUrl } from "@/lib/s3SignedUrl";
import { resolveOrgRole, isSuperAdmin, canManageDepartment } from "@/lib/orgGuard";
import { canViewDocument, filterAccessibleDocuments } from "@/lib/access/documentAccess";
import { getAccessibleRelatedDocuments, getAccessibleExperts } from "@/lib/knowledgeContext";
import { resolveDocumentManagementAccess } from "@/lib/documentManagementPolicy";
import { canReviewDecision } from "@/lib/decisionAccess";

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
      topicDocument: { include: { topic: { select: { id: true, name: true, scope: true } } } },
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

  if (!doc || doc.deletedAt) return NextResponse.json(null, { status: 404 });

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

    if (!(await canViewDocument(doc, { userId: user.id, role }))) {
      return NextResponse.json(null, { status: 404 });
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

  const experts = user && doc.topicDocument?.topic?.id
    ? await getAccessibleExperts({
        orgId: doc.orgId || doc.project?.orgId || "",
        userId: user.id,
        topicId: doc.topicDocument.topic.id,
        isSuperAdmin: isSuperAdmin(role),
        limit: 6,
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

  // Decision Extraction v2, FR-5: a "pending"/"rejected" decision must not
  // appear on the document page either, unless the viewer is a reviewer for
  // this document's department (or super_admin). Everyone else only sees
  // active/reversed/superseded rows, same as the repository/chat surfaces.
  const isDecisionReviewer =
    Boolean(user?.id) && Boolean(role) &&
    (isSuperAdmin(role) ||
      (await canReviewDecision({ document: { departmentId: doc.departmentId, projectId: doc.projectId }, userId: user.id, role })));
  const visibleDecisions = isDecisionReviewer
    ? doc.decisions
    : doc.decisions.filter((d) => d.status !== "pending" && d.status !== "rejected");

  const { conflictsAsDocA, conflictsAsDocB, decisions: _rawDecisions, ...docWithoutRawConflicts } = doc;

  return NextResponse.json({
    ...docWithoutRawConflicts,
    decisions: visibleDecisions,
    conflicts,
    relatedDocuments,
    experts,
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
    select: { id: true, orgId: true, project: { select: { orgId: true } }, lifecycle: true, deletedAt: true, filename: true },
  });
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (doc.deletedAt) return NextResponse.json({ error: "Document already deleted" }, { status: 409 });

  const orgId = doc.orgId || doc.project?.orgId || null;
  const retentionDays = orgId ? await getSetting(orgId, "retention.deletedDays") : 30;
  const deletedAt = new Date();
  const purgeAfter = calculatePurgeAfter(deletedAt, retentionDays);
  const actor = await prisma.user.findUnique({ where: { email: session.user.email }, select: { id: true } });
  try {
    await prisma.$transaction(async (tx) => {
      const changed = await tx.document.updateMany({
        where: { id, deletedAt: null },
        data: { deletedAt, deletedById: actor?.id ?? null, purgeAfter },
      });
      if (changed.count !== 1) throw new Error("ALREADY_DELETED");
      const open = await tx.workflowInstance.findMany({ where: { documentId: id, status: "in_review" }, select: { id: true } });
      if (open.length) {
        const ids = open.map((instance) => instance.id);
        await tx.workflowTask.updateMany({ where: { instanceId: { in: ids }, status: "pending" }, data: { status: "cancelled" } });
        await tx.workflowInstance.updateMany({ where: { id: { in: ids }, status: "in_review" }, data: { status: "cancelled" } });
        if (orgId) for (const instance of open) await tx.auditLog.create({ data: {
          orgId, actorUserId: actor?.id ?? null, action: AUDIT_EVENTS.WORKFLOW_CANCELLED,
          entityType: "workflow", entityId: instance.id,
          before: { status: "in_review" }, after: { status: "cancelled", reason: "document_deleted" },
        } });
      }
      if (orgId) await tx.auditLog.create({ data: {
        orgId, actorUserId: actor?.id ?? null,
        action: AUDIT_EVENTS.DOCUMENT_DELETED,
        entityType: "document", entityId: id,
        before: { deletedAt: null, lifecycle: doc.lifecycle },
        after: { deletedAt: deletedAt.toISOString(), purgeAfter: purgeAfter?.toISOString() ?? null },
        metadata: { deletionMode: "soft" },
      } });
    });
  } catch (error) {
    if (error?.message === "ALREADY_DELETED")
      return NextResponse.json({ error: "Document already deleted" }, { status: 409 });
    console.error("Soft delete failed:", error?.message);
    return NextResponse.json({ error: "Could not delete document" }, { status: 500 });
  }
  return NextResponse.json({ success: true, deletedAt, purgeAfter });
}
