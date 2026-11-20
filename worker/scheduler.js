// EKP Workstream A, F3: scheduled jobs, run inside the long-running worker.
// Every tick it claims due jobs (enabled and past nextRunAt, or "Run now")
// with FOR UPDATE SKIP LOCKED, so several workers never run the same job;
// a claim holds a lock, and a run that crashes is retried once the lock
// expires. Jobs are defined in src/lib/jobs/registry.js.
// See docs/ekp/phase1/WS_A_M365_CONNECTORS.md §3.3.
//
// Between passes it sleeps until the next job is due, not a fixed minute:
// Neon suspends the database after 5 idle minutes and bills compute while it
// is awake, so a check every minute kept it awake around the clock. The app
// wakes the scheduler early through SQS (type "scheduler_wake") when a job is
// turned on, rescheduled or "Run now" is clicked (src/lib/jobs/wakeScheduler.js).

import { JOB_DEFINITIONS, DEFAULT_LOCK_MINUTES } from "../src/lib/jobs/registry.js";

const CLAIM_LIMIT = 5;
// The longest sleep, in case a wake message is lost or a job row is changed
// outside the app. Each check wakes the database for about 5 minutes.
const DEFAULT_MAX_SLEEP_MINUTES = 360;
// After a failed pass (database unreachable), try again after this long.
const RETRY_MS = 5 * 60_000;
const MIN_SLEEP_MS = 1_000;

function maxSleepMs(env = process.env) {
  const minutes = Number(env.SCHEDULER_MAX_SLEEP_MINUTES);
  return (Number.isFinite(minutes) && minutes > 0 ? minutes : DEFAULT_MAX_SLEEP_MINUTES) * 60_000;
}

/**
 * Milliseconds until the next job may be claimed (enabled and due, or "Run
 * now"; a locked job not before its lock expires), or null when nothing is
 * scheduled. Uses the database clock, as claimDueJobs does.
 */
export async function msUntilNextDue(db) {
  const rows = await db.$queryRaw`
    SELECT EXTRACT(EPOCH FROM (
      MIN(GREATEST(CASE WHEN run_requested_at IS NOT NULL THEN now() ELSE next_run_at END, locked_until)) - now()
    )) * 1000 AS ms
    FROM "ScheduledJob"
    WHERE enabled OR run_requested_at IS NOT NULL
  `;
  const ms = rows?.[0]?.ms;
  return ms === null || ms === undefined ? null : Number(ms);
}

/** How long to sleep after a pass, from msUntilNextDue's answer. */
export function sleepAfterPass(msUntilDue, { maxMs = maxSleepMs() } = {}) {
  if (msUntilDue === null || msUntilDue === undefined || !Number.isFinite(msUntilDue)) return maxMs;
  return Math.min(maxMs, Math.max(MIN_SLEEP_MS, Math.ceil(msUntilDue)));
}

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
    if (def.lockMinutes) {
      await db.scheduledJob.update({
        where: { id: job.id },
        data: { lockedUntil: new Date(Date.now() + def.lockMinutes * 60_000) },
      });
    }
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

/**
 * Start the scheduler loop alongside the SQS loop. Set SCHEDULER_ENABLED=false
 * to turn it off. Returns { wake, stop }: wake() runs a pass now (the SQS loop
 * calls it on a "scheduler_wake" message).
 */
export function startScheduler(db, deps) {
  if (process.env.SCHEDULER_ENABLED === "false") {
    console.log("Scheduler disabled (SCHEDULER_ENABLED=false)");
    return { wake() {}, stop() {} };
  }
  let running = false;
  let again = false; // a wake arrived during a pass: run another one after it
  let stopped = false;
  let timer = null;

  const schedule = (ms) => {
    clearTimeout(timer);
    if (!stopped) timer = setTimeout(loop, ms);
  };

  const loop = async () => {
    if (running) {
      again = true; // never overlap passes
      return;
    }
    running = true;
    let sleepMs;
    try {
      do {
        again = false;
        await tick(db, deps);
      } while (again);
      sleepMs = sleepAfterPass(await msUntilNextDue(db));
    } catch (err) {
      console.error("❌ Scheduler tick failed:", err.message);
      sleepMs = RETRY_MS;
    } finally {
      running = false;
    }
    schedule(again ? 0 : sleepMs);
  };

  schedule(5_000);
  console.log(`Scheduler started (sleeps until the next job is due, at most ${maxSleepMs() / 60_000} min).`);
  return {
    wake() {
      if (running) again = true;
      else schedule(0);
    },
    stop() {
      stopped = true;
      clearTimeout(timer);
    },
  };
}
