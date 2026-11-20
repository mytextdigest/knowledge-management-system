// Completing a document whose processing stopped part-way. The API queues a
// worker `repair` job; the worker checks what's missing at that moment
// (src/lib/documentPipeline.js) and runs the pipeline from the first missing
// stage, so every later stage runs again too.

import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";
import { PROCESSING_STATUSES } from "./documentStatus.js";

export { PROCESSING_STATUSES };

/**
 * Queue a repair for a document the worker isn't working on. The status moves
 * to "queued" first, in one conditional update, so concurrent callers queue
 * the job only once; if sending fails the status is put back.
 * regenerateSummary: when nothing is missing, regenerate the summary anyway
 * (the Regenerate button). Returns true when this call queued the job.
 */
export async function queueRepair(db, doc, { regenerateSummary = false, send = sendToQueue } = {}) {
  const claimed = await db.document.updateMany({
    where: { id: doc.id, status: doc.status, NOT: { status: { in: [...PROCESSING_STATUSES] } } },
    data: { status: "queued" },
  });
  if (claimed.count !== 1) return false;
  try {
    await send({ type: "repair", docId: doc.id, regenerateSummary });
    return true;
  } catch (err) {
    await db.document.updateMany({ where: { id: doc.id, status: "queued" }, data: { status: doc.status } });
    throw err;
  }
}

async function sendToQueue(body) {
  const sqs = new SQSClient({ region: process.env.AWS_REGION });
  await sqs.send(new SendMessageCommand({ QueueUrl: process.env.SQS_QUEUE_URL, MessageBody: JSON.stringify(body) }));
}
