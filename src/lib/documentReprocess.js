// Repairing a "ready" document whose index or summary is incomplete, using
// the worker's existing jobs (no worker change): an `embed` job re-embeds
// every chunk (Chunk.embedding and embedding_vec) and then queues `summarize`
// itself, which rebuilds the summary from the stored chunks. No original
// file is needed for either step.

import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";

export { PROCESSING_STATUSES } from "./documentStatus.js";


/** How many of the document's chunks have text, and how many of those have a search vector. */
export async function documentIndexState(db, documentId) {
  const [row] = await db.$queryRaw`
    SELECT count(*)::int AS chunks, count(embedding_vec)::int AS embedded
    FROM "Chunk"
    WHERE document_id = ${documentId} AND coalesce(btrim(text), '') <> ''`;
  return { chunks: row?.chunks ?? 0, embedded: row?.embedded ?? 0 };
}

/** A ready document with readable chunks, some of them missing their search vector. */
export function hasIncompleteIndex(doc, state) {
  return doc?.status === "ready" && state.chunks > 0 && state.embedded < state.chunks;
}

/**
 * Queue the worker's embed job (which then re-summarizes) for a ready
 * document. The status moves ready → chunked first, in one conditional
 * update, so concurrent callers queue the job only once; if sending fails the
 * status goes back to ready. Returns true when this call queued the job.
 */
export async function queueReprocessing(db, doc, { send = sendToQueue } = {}) {
  const claimed = await db.document.updateMany({
    where: { id: doc.id, status: "ready" },
    data: { status: "chunked" },
  });
  if (claimed.count !== 1) return false;
  try {
    await send({ type: "embed", docId: doc.id, filename: doc.filename, projectId: doc.projectId || null });
    return true;
  } catch (err) {
    await db.document.updateMany({ where: { id: doc.id, status: "chunked" }, data: { status: "ready" } });
    throw err;
  }
}

async function sendToQueue(body) {
  const sqs = new SQSClient({ region: process.env.AWS_REGION });
  await sqs.send(new SendMessageCommand({ QueueUrl: process.env.SQS_QUEUE_URL, MessageBody: JSON.stringify(body) }));
}
