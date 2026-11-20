// EKP B-9 / B-24 (E23.4): the documents.purge-deleted scheduled job. Removes
// soft-deleted documents whose retention period has passed: their stored
// files (current and earlier versions), topic membership, conversations,
// chunks and the document row (versions, ACL rows, reviews and the rest
// cascade). Each purge is audited as document.purged.
//
// retention.deletedDays = null means "never purge" (NYPA Q&A #181): the job
// does nothing, even for documents deleted while a retention period applied,
// so they stay restorable.
//
// Runs in the worker (plain Node): relative imports only.

import { S3Client, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSetting } from "../settings/index.js";
import { createPurgePlan } from "./purgePolicy.mjs";
import { AUDIT_EVENTS } from "../audit/events.js";
import { computeDocumentEmbedding, adjustTopicOnDocumentRemoval } from "../topicUtils.js";

let s3;
async function deleteS3Object(key) {
  s3 ??= new S3Client({ region: process.env.AWS_REGION });
  await s3.send(new DeleteObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key }));
}

const PLAN_SELECT = {
  id: true, orgId: true, filename: true, deletedAt: true, deletedById: true, purgeAfter: true, filePath: true,
  versions: { select: { filePath: true } },
  supersedes: { where: { deletedAt: null }, select: { id: true }, take: 1 },
  workflowInstances: { where: { status: "in_review" }, select: { status: true }, take: 1 },
  reviewRecords: { where: { status: "pending" }, select: { status: true }, take: 1 },
  topicDocument: { select: { topicId: true } },
  _count: { select: { chunks: true, versions: true } },
};

/**
 * Purge this org's expired soft-deleted documents, oldest deadline first.
 * `deleteObject` (S3 key -> Promise) and `adjustTopic` are injectable for
 * tests. Returns a small summary for the Scheduled jobs page.
 */
export async function purgeDeletedDocuments({
  db, orgId, now = new Date(), limit = 50,
  deleteObject = deleteS3Object, adjustTopic = adjustTopicForRemoval,
}) {
  const retentionDays = await getSetting(orgId, "retention.deletedDays");
  if (retentionDays === null) return { skipped: "Retention is set to never purge", purged: 0 };

  const docs = await db.document.findMany({
    where: { orgId, deletedAt: { not: null }, purgeAfter: { lte: now } },
    select: PLAN_SELECT,
    orderBy: [{ purgeAfter: "asc" }, { id: "asc" }],
    take: limit,
  });

  let purged = 0;
  let files = 0;
  const blocked = [];
  const failed = [];
  for (const doc of docs) {
    const plan = createPurgePlan(doc, now);
    if (plan.blocked) { blocked.push({ documentId: doc.id, blockers: plan.blockers }); continue; }
    try {
      // Files first: if storage can't be cleaned, keep the row and retry on the next run.
      for (const key of plan.objectKeys) { await deleteObject(key); files++; }
      if (doc.topicDocument) await adjustTopic(doc.id, doc.topicDocument.topicId);
      const done = await db.$transaction(async (tx) => {
        // Restored or re-scheduled meanwhile? Then leave it.
        const still = await tx.document.findFirst({
          where: { id: doc.id, orgId, deletedAt: { not: null }, purgeAfter: { lte: now } }, select: { id: true },
        });
        if (!still) return false;
        await tx.message.deleteMany({ where: { conversation: { documentId: doc.id } } });
        await tx.conversation.deleteMany({ where: { documentId: doc.id } });
        await tx.chunk.deleteMany({ where: { documentId: doc.id } });
        await tx.document.delete({ where: { id: doc.id } });
        await tx.auditLog.create({ data: {
          orgId, actorUserId: null, action: AUDIT_EVENTS.DOCUMENT_PURGED,
          entityType: "document", entityId: doc.id,
          before: { filename: doc.filename, deletedAt: doc.deletedAt, deletedById: doc.deletedById, purgeAfter: doc.purgeAfter },
          after: null,
          metadata: { files: plan.objectKeys.length, chunks: plan.chunkCount, versions: plan.versionCount },
        } });
        return true;
      });
      if (done) purged++;
    } catch (err) {
      failed.push({ documentId: doc.id, error: String(err?.message || err).slice(0, 200) });
    }
  }
  return { purged, files, blocked: blocked.length, failed: failed.length, ...(blocked.length ? { blockedDocuments: blocked.slice(0, 10) } : {}), ...(failed.length ? { failures: failed.slice(0, 10) } : {}) };
}

// Same as the pre-B-9 hard delete: take the document out of its topic's centroid.
async function adjustTopicForRemoval(documentId, topicId) {
  try {
    const embedding = await computeDocumentEmbedding(documentId);
    await adjustTopicOnDocumentRemoval(topicId, embedding, null);
  } catch (err) {
    console.error("Purge: topic centroid adjustment failed:", err?.message);
  }
}
