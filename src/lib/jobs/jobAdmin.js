// EKP Workstream A, F3: shared helpers for the Scheduled jobs admin API.
import { JOB_DEFINITIONS, INTERVAL_CHOICES } from "./registry.js";

export function serializeJob(job, now = new Date()) {
  const def = JOB_DEFINITIONS[job.name];
  const running = job.lastStatus === "running" && job.lockedUntil && job.lockedUntil > now;
  return {
    id: job.id,
    name: job.name,
    label: def?.label ?? job.name,
    description: def?.description ?? null,
    enabled: job.enabled,
    intervalMinutes: job.intervalMinutes,
    nextRunAt: job.enabled ? job.nextRunAt : null,
    lastRunAt: job.lastRunAt,
    lastStatus: running ? "running" : job.lastStatus === "running" ? null : job.lastStatus,
    lastError: job.lastError,
    lastDurationMs: job.lastDurationMs,
    lastResult: job.lastResult,
    runRequested: Boolean(job.runRequestedAt),
  };
}

/** Validate { enabled?, intervalMinutes? }. Returns { data } or { error }. */
export function validateJobPatch(body, job, now = new Date()) {
  const data = {};
  if (body.intervalMinutes !== undefined) {
    const minutes = Number(body.intervalMinutes);
    if (!INTERVAL_CHOICES.includes(minutes)) return { error: "Invalid interval" };
    data.intervalMinutes = minutes;
  }
  if (body.enabled !== undefined) {
    if (typeof body.enabled !== "boolean") return { error: "enabled must be true or false" };
    data.enabled = body.enabled;
  }
  // Re-plan the next run from the last run (or now) with the new interval.
  if (data.intervalMinutes !== undefined || (data.enabled === true && !job.enabled)) {
    const interval = data.intervalMinutes ?? job.intervalMinutes;
    const base = job.lastRunAt ?? now;
    data.nextRunAt = new Date(Math.max(now.getTime(), base.getTime() + interval * 60_000));
  }
  return { data };
}
