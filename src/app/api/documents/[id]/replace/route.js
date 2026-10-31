export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { S3Client, HeadObjectCommand } from "@aws-sdk/client-s3";
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";
import { prisma } from "@/lib/prisma";
import { AUDIT_EVENTS } from "@/lib/audit/events";
import { snapshotVersion } from "@/lib/lifecycle/versioning.mjs";

// Replace the binary behind the same logical document. The normal worker pipeline
// deletes/rebuilds chunks, embeddings, classifications, and pending duplicate flags.
export async function POST(req, { params }) {
  const session = await getServerSession();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json();
  const s3Key = String(body?.s3Key || "").trim();
  if (!s3Key) return NextResponse.json({ error: "s3Key is required" }, { status: 400 });

  const doc = await prisma.document.findFirst({
    where: { id, user: { email: session.user.email } },
    select: { id: true, projectId: true, orgId: true, visibility: true, filename: true, filePath: true, status: true, userId: true, content: true, summary: true },
  });
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const s3 = new S3Client({ region: process.env.AWS_REGION });
  await s3.send(new HeadObjectCommand({ Bucket: process.env.S3_BUCKET, Key: s3Key }));
  const filename = s3Key.split("/").pop() || doc.filename;

  // Lock the document row so concurrent replacements cannot allocate the same version.
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Document" WHERE id = ${id} FOR UPDATE`;
    const current = await tx.document.findUnique({
      where: { id },
      select: { id: true, filename: true, filePath: true, content: true, summary: true, status: true },
    });
    if (!current) throw new Error('Document disappeared during replacement');
    const aggregate = await tx.documentVersion.aggregate({
      where: { documentId: id }, _max: { versionNumber: true },
    });
    const versionNumber = (aggregate._max.versionNumber ?? 0) + 1;
    await tx.documentVersion.create({
      data: snapshotVersion(current, versionNumber, doc.userId),
    });
    await tx.documentDuplicate.deleteMany({
      where: { OR: [{ documentId: id }, { duplicateOfId: id }] },
    });
    await tx.document.update({
      where: { id },
      data: {
        filename, filePath: s3Key, content: null, summary: null, status: "queued",
        category: null, categoryConfidence: null,
        classificationStatus: "pending_classification",
        suggestedDepartmentId: null, departmentSuggestionConfidence: null,
        contentHash: null, classifiedAt: null,
      },
    });
    if (doc.orgId) {
      await tx.auditLog.create({ data: {
        orgId: doc.orgId, actorUserId: doc.userId,
        action: AUDIT_EVENTS.DOCUMENT_VERSION_CREATED,
        entityType: 'document', entityId: id,
        before: { filename: current.filename, status: current.status },
        after: { filename, status: 'queued', previousVersion: versionNumber },
      } });
    }
  });

  const sqs = new SQSClient({ region: process.env.AWS_REGION });
  await sqs.send(new SendMessageCommand({
    QueueUrl: process.env.SQS_QUEUE_URL,
    MessageBody: JSON.stringify({
      type: "chunk",
      docId: id,
      s3Key,
      filename,
      projectId: doc.projectId,
      orgId: doc.orgId,
      visibility: doc.visibility,
      regenerate: false,
      contentReplacement: true,
    }),
  }));

  return NextResponse.json({ success: true, id, status: "queued" });
}
