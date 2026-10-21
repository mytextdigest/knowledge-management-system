// EKP Workstream A, F3: scheduled jobs, run inside the long-running worker.
// Every tick it claims due jobs (enabled and past nextRunAt, or "Run now")
// with FOR UPDATE SKIP LOCKED, so several workers never run the same job;
// a claim holds a lock, and a run that crashes is retried once the lock
// expires. Jobs are defined in src/lib/jobs/registry.js.
// See docs/ekp/phase1/WS_A_M365_CONNECTORS.md §3.3.

import { JOB_DEFINITIONS, DEFAULT_LOCK_MINUTES } from "../src/lib/jobs/registry.js";

const TICK_MS = 60_000;
const CLAIM_LIMIT = 5;

/** Atomically claim up to `limit` due jobs. Returns the claimed rows. */
export async function claimDueJobs(db, { limit = CLAIM_LIMIT, lockMinutes = DEFAULT_LOCK_MINUTES } = {}) {
  return db.$queryRaw`
    UPDATE "ScheduledJob"
    SET locked_until = now() + make_interval(mins => ${lockMinutes}::int),
        last_status = 'running',
        run_requested_at = NULL
    WHERE id IN (
      SELECT id FROM "ScheduledJob"
      WHERE ((enabled AND next_run_at <= now()) OR run_requested_at IS NOT NULL)
        AND (locked_until IS NULL OR locked_until < now())
      ORDER BY next_run_at
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id, name, "orgId", interval_minutes AS "intervalMinutes"
  `;
}

/** Run one claimed job and record the outcome. Never throws. */
export async function runJob(db, job, { definitions = JOB_DEFINITIONS, enqueue }) {
  const startedAt = new Date();
  let lastStatus = "ok";
  let lastError = null;
  let lastResult = null;

  try {
    const def = definitions[job.name];
    if (!def) throw new Error(`Unknown job "${job.name}"`);
    lastResult = (await def.run({ prisma: db, orgId: job.orgId, enqueue })) ?? null;
  } catch (err) {
    lastStatus = "failed";
    lastError = String(err?.message || err).slice(0, 2000);
    console.error(`❌ Scheduled job ${job.name} (${job.orgId ?? "global"}) failed:`, lastError);
  }

  // Re-read the interval: an admin may have changed it during the run.
  const current = await db.scheduledJob.findUnique({ where: { id: job.id }, select: { intervalMinutes: true } });
  const intervalMinutes = current?.intervalMinutes ?? job.intervalMinutes;
  await db.scheduledJob.update({
    where: { id: job.id },
    data: {
      lastRunAt: startedAt,
      lastStatus,
      lastError,
      lastResult,
      lastDurationMs: Date.now() - startedAt.getTime(),
      lockedUntil: null,
      nextRunAt: new Date(Date.now() + intervalMinutes * 60_000),
    },
  });
  return { status: lastStatus, result: lastResult, error: lastError };
}

/** One scheduler pass: claim due jobs and run them one after another. */
export async function tick(db, deps) {
  const claimed = await claimDueJobs(db);
  for (const job of claimed) {
    console.log(`⏰ Scheduled job ${job.name} (${job.orgId ?? "global"})`);
    await runJob(db, job, deps);
  }
  return claimed.length;
}

/** Start the scheduler loop alongside the SQS loop. Set SCHEDULER_ENABLED=false to turn it off. */
export function startScheduler(db, deps) {
  if (process.env.SCHEDULER_ENABLED === "false") {
    console.log("Scheduler disabled (SCHEDULER_ENABLED=false)");
    return;
  }
  let running = false;
  const loop = async () => {
    if (running) return; // never overlap passes
    running = true;
    try {
      await tick(db, deps);
    } catch (err) {
      console.error("❌ Scheduler tick failed:", err.message);
    } finally {
      running = false;
    }
  };
  setTimeout(loop, 5_000);
  setInterval(loop, TICK_MS);
  console.log("Scheduler started (checks every 60s).");
}
