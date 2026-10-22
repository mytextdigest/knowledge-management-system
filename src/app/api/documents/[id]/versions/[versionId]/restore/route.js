export const runtime = "nodejs";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";
import { prisma } from "@/lib/prisma";
import { resolveDocumentManagementAccess } from "@/lib/documentManagementPolicy";
import { snapshotVersion } from "@/lib/lifecycle/versioning.mjs";
import { AUDIT_EVENTS } from "@/lib/audit/events";

export async function POST(_req, { params }) {
  const session = await getServerSession();
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id, versionId } = await params;
  const access = await resolveDocumentManagementAccess(session.user.email, id);
  if (!access.document || !access.canManage) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const actor = await prisma.user.findUnique({ where: { email: session.user.email }, select: { id: true } });
  let restored;
  try {
    restored = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Document" WHERE id = ${id} FOR UPDATE`;
      const doc = await tx.document.findUnique({ where: { id }, select: {
        id: true, filename: true, filePath: true, content: true, summary: true, status: true,
        deletedAt: true, orgId: true, projectId: true, visibility: true,
      } });
      if (!doc || doc.deletedAt) throw new Error("DOCUMENT_UNAVAILABLE");
      const target = await tx.documentVersion.findFirst({ where: { id: versionId, documentId: id } });
      if (!target || !target.filePath) throw new Error("VERSION_UNAVAILABLE");
      const max = await tx.documentVersion.aggregate({ where: { documentId: id }, _max: { versionNumber: true } });
      await tx.documentVersion.create({ data: snapshotVersion(doc, (max._max.versionNumber ?? 0) + 1, actor?.id) });
      await tx.documentDuplicate.deleteMany({ where: { OR: [{ documentId: id }, { duplicateOfId: id }] } });
      await tx.document.update({ where: { id }, data: {
        filename: target.filename, filePath: target.filePath, content: null, summary: null,
        status: "queued", category: null, categoryConfidence: null,
        classificationStatus: "pending_classification", contentHash: null, classifiedAt: null,
      } });
      if (doc.orgId) await tx.auditLog.create({ data: {
        orgId: doc.orgId, actorUserId: actor?.id ?? null,
        action: AUDIT_EVENTS.DOCUMENT_VERSION_RESTORED,
        entityType: "document", entityId: id,
        before: { filename: doc.filename, status: doc.status },
        after: { restoredVersionId: versionId, filename: target.filename, status: "queued" },
      } });
      return { filePath: target.filePath, filename: target.filename, projectId: doc.projectId,
        orgId: doc.orgId, visibility: doc.visibility };
    });
  } catch (error) {
    if (["DOCUMENT_UNAVAILABLE", "VERSION_UNAVAILABLE"].includes(error?.message))
      return NextResponse.json({ error: error.message }, { status: 409 });
    console.error("Version restore failed", error?.message);
    return NextResponse.json({ error: "Restore failed" }, { status: 500 });
  }
  try {
    const sqs = new SQSClient({ region: process.env.AWS_REGION });
    await sqs.send(new SendMessageCommand({ QueueUrl: process.env.SQS_QUEUE_URL,
      MessageBody: JSON.stringify({ type: "chunk", docId: id, s3Key: restored.filePath,
        filename: restored.filename, projectId: restored.projectId, orgId: restored.orgId,
        visibility: restored.visibility, regenerate: false, contentReplacement: true }),
    }));
  } catch (error) {
    console.error("Restore reprocessing queue failed", error?.message);
    return NextResponse.json({ error: "Version restored but reprocessing queue failed; document remains queued" }, { status: 503 });
  }
  return NextResponse.json({ success: true, status: "queued" });
}
