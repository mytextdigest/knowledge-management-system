export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { S3Client, HeadObjectCommand } from "@aws-sdk/client-s3";
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";
import { prisma } from "@/lib/prisma";

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
    select: { id: true, projectId: true, orgId: true, visibility: true, filename: true },
  });
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const s3 = new S3Client({ region: process.env.AWS_REGION });
  await s3.send(new HeadObjectCommand({ Bucket: process.env.S3_BUCKET, Key: s3Key }));
  const filename = s3Key.split("/").pop() || doc.filename;

  await prisma.$transaction([
    prisma.documentDuplicate.deleteMany({
      where: { OR: [{ documentId: id }, { duplicateOfId: id }] },
    }),
    prisma.document.update({
      where: { id },
      data: {
        filename,
        filePath: s3Key,
        content: null,
        summary: null,
        status: "queued",
        category: null,
        categoryConfidence: null,
        classificationStatus: "pending_classification",
        suggestedDepartmentId: null,
        departmentSuggestionConfidence: null,
        contentHash: null,
        classifiedAt: null,
      },
    }),
  ]);

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
