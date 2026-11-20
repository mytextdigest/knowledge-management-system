// EKP F3: wake the worker's scheduler (worker/scheduler.js) after a job is
// turned on, rescheduled or "Run now" is clicked. The scheduler sleeps until
// the next job is due, so the database (Neon) can suspend between runs.
//
// Best effort: if the message can't be sent, the scheduler still checks at
// least every SCHEDULER_MAX_SLEEP_MINUTES (default 6 hours).
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";

let sqs;

export async function wakeScheduler() {
  if (!process.env.SQS_QUEUE_URL) return false;
  try {
    sqs ??= new SQSClient({ region: process.env.AWS_REGION });
    await sqs.send(
      new SendMessageCommand({ QueueUrl: process.env.SQS_QUEUE_URL, MessageBody: JSON.stringify({ type: "scheduler_wake" }) })
    );
    return true;
  } catch (err) {
    console.error("Couldn't wake the job scheduler:", err.message);
    return false;
  }
}
