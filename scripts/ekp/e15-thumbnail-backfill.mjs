// EKP E-15: thumbnails for documents stored before E-M4. Lists the stored
// PDFs, decks, images and videos that have no thumbnail yet and, with
// --apply, queues a worker "thumbnail" job for each ("slide_preview" for a
// deck: the thumbnail follows its render). Images uploaded before E-M4 were
// rejected, so there are none to read again. Read-only without --apply.
//
//   node --env-file=.env scripts/ekp/e15-thumbnail-backfill.mjs [--org <orgId>]           # list only
//   node --env-file=.env scripts/ekp/e15-thumbnail-backfill.mjs [--org <orgId>] --apply   # queue jobs
//
// Needs DATABASE_URL, SQS_QUEUE_URL and AWS credentials (for --apply).

import { PrismaClient } from "@prisma/client";
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";
import { thumbnailKind } from "../../src/lib/thumbnails.js";

const apply = process.argv.includes("--apply");
const orgArg = process.argv.indexOf("--org");
const orgId = orgArg > 0 ? process.argv[orgArg + 1] : null;
const EXTENSIONS = [".pdf", ".pptx", ".png", ".jpg", ".jpeg", ".mp4", ".mov"];

const prisma = new PrismaClient();
try {
  const docs = await prisma.document.findMany({
    where: {
      ...(orgId ? { orgId } : {}),
      deletedAt: null,
      filePath: { not: null },
      thumbnailPath: null,
      OR: EXTENSIONS.map((ext) => ({ filename: { endsWith: ext, mode: "insensitive" } })),
    },
    select: { id: true, orgId: true, filename: true },
    orderBy: { createdAt: "desc" },
  });
  const byKind = {};
  for (const d of docs) byKind[thumbnailKind(d.filename)] = (byKind[thumbnailKind(d.filename)] || 0) + 1;
  console.log(`${docs.length} stored document(s) without a thumbnail${orgId ? ` in org ${orgId}` : ""}:`, byKind);

  if (!apply) {
    console.log("Read-only. Run again with --apply to queue the jobs.");
  } else {
    if (!process.env.SQS_QUEUE_URL) throw new Error("Set SQS_QUEUE_URL");
    const sqs = new SQSClient({ region: process.env.AWS_REGION });
    let queued = 0;
    for (const d of docs) {
      const type = thumbnailKind(d.filename) === "slides" ? "slide_preview" : "thumbnail";
      await sqs.send(new SendMessageCommand({ QueueUrl: process.env.SQS_QUEUE_URL, MessageBody: JSON.stringify({ type, docId: d.id }) }));
      queued++;
    }
    console.log(`Queued ${queued} job(s). The worker logs "🖼️ Thumbnail stored for …" for each.`);
  }
} finally {
  await prisma.$disconnect();
}
