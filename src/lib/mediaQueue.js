// EKP E11.3 / E11.7 (Workstream E): the app's side of the worker's media jobs
// (worker/transcription.js): queue a transcription or new chapters.
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";

const sqs = new SQSClient({ region: process.env.AWS_REGION });

export async function queueMediaWork(body) {
  await sqs.send(new SendMessageCommand({ QueueUrl: process.env.SQS_QUEUE_URL, MessageBody: JSON.stringify(body) }));
}

/** A recording's chapters are made again from its current transcript (or cleared when it has none). */
export const queueChapters = (recordingId) => queueMediaWork({ type: "segment", docId: recordingId });
