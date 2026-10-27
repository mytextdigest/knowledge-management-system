// A-7 / F3: scheduled jobs (worker/scheduler.js, src/lib/jobs/*).
// DB cases run inside a transaction that is always rolled back.
// Run: EKP_DB_TESTS=1 npm run ekp:f3:test
import test from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { claimDueJobs, runJob } from "../../worker/scheduler.js";
import { JOB_DEFINITIONS, ensureOrgJobs, jobKey, INTERVAL_CHOICES } from "../../src/lib/jobs/registry.js";
import { validateJobPatch, serializeJob } from "../../src/lib/jobs/jobAdmin.js";

const RUN_DB_TESTS = process.env.EKP_DB_TESTS === "1";
const ROLLBACK = Symbol("rollback");
const MIN = 60_000;

test("job patch: only listed intervals; enabling or a new interval re-plans the next run", () => {
  const now = new Date("2026-10-21T12:00:00Z");
  const job = { enabled: false, intervalMinutes: 60, lastRunAt: new Date("2026-10-21T11:50:00Z") };
  assert.ok(validateJobPatch({ intervalMinutes: 7 }, job, now).error);
  assert.ok(validateJobPatch({ enabled: "yes" }, job, now).error);
  assert.equal(validateJobPatch({ enabled: true }, job, now).data.nextRunAt.toISOString(), "2026-10-21T12:50:00.000Z");
  assert.equal(validateJobPatch({ intervalMinutes: 15 }, job, now).data.nextRunAt.toISOString(), "2026-10-21T12:05:00.000Z");
  assert.equal(validateJobPatch({ intervalMinutes: 15 }, { ...job, lastRunAt: null }, now).data.nextRunAt.toISOString(), "2026-10-21T12:15:00.000Z");
  assert.equal(validateJobPatch({ enabled: false }, { ...job, enabled: true }, now).data.nextRunAt, undefined);
  assert.ok(INTERVAL_CHOICES.includes(JOB_DEFINITIONS["sharepoint.sync"].defaultIntervalMinutes));
});

test("A-22: syncs can run every 5 minutes, 4 is rejected; the permissions refresh keeps a 60-minute floor", () => {
  const now = new Date("2026-10-21T12:00:00Z");
  const sync = { name: "sharepoint.sync", enabled: true, intervalMinutes: 60, lastRunAt: null };
  assert.equal(validateJobPatch({ intervalMinutes: 5 }, sync, now).data.intervalMinutes, 5);
  assert.equal(validateJobPatch({ intervalMinutes: 5 }, { ...sync, name: "servicenow.sync" }, now).data.intervalMinutes, 5);
  assert.ok(validateJobPatch({ intervalMinutes: 4 }, sync, now).error);

  const refresh = { ...sync, name: "sharepoint.acl-refresh", intervalMinutes: 1440 };
  assert.match(validateJobPatch({ intervalMinutes: 5 }, refresh, now).error, /every 60 minutes/);
  assert.equal(validateJobPatch({ intervalMinutes: 60 }, refresh, now).data.intervalMinutes, 60);
  assert.deepEqual(serializeJob(refresh).intervalChoices, [60, 240, 720, 1440]);
  // A row set to 15 minutes before the floor existed still shows its interval.
  assert.deepEqual(serializeJob({ ...refresh, intervalMinutes: 15 }).intervalChoices, [15, 60, 240, 720, 1440]);
  assert.deepEqual(serializeJob(sync).intervalChoices, INTERVAL_CHOICES);
});

test("serialize: a 'running' status with an expired lock isn't shown as running", () => {
  const now = new Date();
  const base = { id: "j", name: "sharepoint.sync", enabled: true, intervalMinutes: 60, nextRunAt: now };
  assert.equal(serializeJob({ ...base, lastStatus: "running", lockedUntil: new Date(now.getTime() + MIN) }, now).lastStatus, "running");
  assert.equal(serializeJob({ ...base, lastStatus: "running", lockedUntil: new Date(now.getTime() - MIN) }, now).lastStatus, null);
  assert.equal(serializeJob({ ...base, enabled: false }, now).nextRunAt, null);
});

test("scheduler claims, runs and records jobs", { skip: !RUN_DB_TESTS }, async () => {
  const prisma = new PrismaClient();
  const tag = `${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
  try {
    await prisma.$transaction(async (db) => {
      const org = await db.organization.create({ data: { name: `f3-${tag}` } });
      const now = Date.now();
      const mk = (name, data) => db.scheduledJob.create({
        data: { key: jobKey(`${name}-${tag}`, org.id), name: `${name}-${tag}`, orgId: org.id, intervalMinutes: 60, enabled: true, nextRunAt: new Date(now - MIN), ...data },
      });
      const due = await mk("due", {});
      await mk("future", { nextRunAt: new Date(now + 30 * MIN) });
      await mk("disabled", { enabled: false });
      const runNow = await mk("runnow", { enabled: false, nextRunAt: new Date(now + 30 * MIN), runRequestedAt: new Date() });
      await mk("locked", { lockedUntil: new Date(now + 10 * MIN), lastStatus: "running" });
      const crashed = await mk("crashed", { lockedUntil: new Date(now - MIN), lastStatus: "running" });

      // Only this org's test rows (other rows in the shared DB aren't due: none are enabled yet).
      const claimed = (await claimDueJobs(db, { limit: 50 })).filter((j) => j.orgId === org.id);
      assert.deepEqual(claimed.map((j) => j.id).sort(), [due.id, runNow.id, crashed.id].sort());
      const afterClaim = await db.scheduledJob.findUnique({ where: { id: runNow.id } });
      assert.equal(afterClaim.runRequestedAt, null, "Run now is consumed by the claim");
      assert.ok(afterClaim.lockedUntil > new Date(), "claimed jobs are locked");
      assert.equal((await claimDueJobs(db, { limit: 50 })).filter((j) => j.orgId === org.id).length, 0, "locked jobs aren't claimed twice");

      // Running: success, failure, unknown handler.
      const defs = {
        [due.name]: { run: async ({ orgId }) => ({ ran: orgId }) },
        [runNow.name]: { run: async () => { throw new Error("boom"); } },
      };
      const ok = await runJob(db, claimed.find((j) => j.id === due.id), { definitions: defs });
      assert.equal(ok.status, "ok");
      const okRow = await db.scheduledJob.findUnique({ where: { id: due.id } });
      assert.equal(okRow.lastStatus, "ok");
      assert.deepEqual(okRow.lastResult, { ran: org.id });
      assert.equal(okRow.lockedUntil, null);
      assert.ok(Math.abs(okRow.nextRunAt.getTime() - (Date.now() + 60 * MIN)) < 5 * MIN, "next run one interval later");

      await runJob(db, claimed.find((j) => j.id === runNow.id), { definitions: defs });
      const failRow = await db.scheduledJob.findUnique({ where: { id: runNow.id } });
      assert.equal(failRow.lastStatus, "failed");
      assert.equal(failRow.lastError, "boom");
      assert.equal(failRow.enabled, false, "a one-off Run now doesn't turn the job on");

      await runJob(db, claimed.find((j) => j.id === crashed.id), { definitions: defs });
      assert.match((await db.scheduledJob.findUnique({ where: { id: crashed.id } })).lastError, /Unknown job/);

      throw ROLLBACK;
    }, { timeout: 60_000, maxWait: 20_000 });
  } catch (err) {
    if (err !== ROLLBACK) throw err;
  } finally {
    await prisma.$disconnect();
  }
});

test("sharepoint.sync: job row only for connected orgs, starts off; queues a scheduled sync; no pile-up", { skip: !RUN_DB_TESTS }, async () => {
  const prisma = new PrismaClient();
  const tag = `${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
  try {
    await prisma.$transaction(async (db) => {
      const org = await db.organization.create({ data: { name: `f3-sp-${tag}` } });
      await ensureOrgJobs(db, org.id);
      assert.equal(await db.scheduledJob.count({ where: { orgId: org.id } }), 0, "no SharePoint, no job");

      const integration = await db.orgIntegration.create({
        data: { orgId: org.id, provider: "sharepoint", scopeConfig: { sites: [] }, accessToken: "x", tokenExpiry: new Date() },
      });
      await ensureOrgJobs(db, org.id);
      await ensureOrgJobs(db, org.id);
      const rows = await db.scheduledJob.findMany({ where: { orgId: org.id, name: "sharepoint.sync" } });
      assert.equal(rows.length, 1, "idempotent");
      assert.equal(rows[0].name, "sharepoint.sync");
      assert.equal(rows[0].enabled, false, "starts off");

      const sent = [];
      const enqueue = async (body) => { sent.push(body); };
      const first = await JOB_DEFINITIONS["sharepoint.sync"].run({ prisma: db, orgId: org.id, enqueue });
      const run = await db.syncRun.findUnique({ where: { id: first.syncRunId } });
      assert.equal(run.trigger, "scheduled");
      assert.deepEqual(sent, [{ type: "sharepoint_sync", integrationId: integration.id, syncRunId: run.id }]);

      const second = await JOB_DEFINITIONS["sharepoint.sync"].run({ prisma: db, orgId: org.id, enqueue });
      assert.match(second.skipped, /already running/);
      assert.equal(sent.length, 1);

      await db.orgIntegration.update({ where: { id: integration.id }, data: { status: "disconnected" } });
      assert.match((await JOB_DEFINITIONS["sharepoint.sync"].run({ prisma: db, orgId: org.id, enqueue })).skipped, /isn't connected/);

      throw ROLLBACK;
    }, { timeout: 60_000, maxWait: 20_000 });
  } catch (err) {
    if (err !== ROLLBACK) throw err;
  } finally {
    await prisma.$disconnect();
  }
});
