// EKP Workstream A, F3: the scheduled job registry. Each entry is one kind of
// job; the worker's scheduler (worker/scheduler.js) runs it per org on its
// interval, and Settings → Scheduled jobs lets a super admin turn it on, set
// the interval and run it now. See WS_A_M365_CONNECTORS.md §3.3.
//
// Imported by both the worker (plain Node) and the web app, so it must only
// use relative imports, never "@/...".
//
// To add a job (e.g. Workstream B's content.stale-scan): add an entry with
//   label, description           shown on the Scheduled jobs page
//   defaultIntervalMinutes        one of INTERVAL_CHOICES
//   appliesTo({ prisma, orgId })  whether this org gets the job (row is created lazily)
//   run({ prisma, orgId, enqueue })
//                                 do the work, or enqueue an SQS job; return a small
//                                 JSON summary (stored as lastResult). Throw to fail.

export const INTERVAL_CHOICES = [15, 30, 60, 240, 720, 1440];

// How long a claimed run holds its lock. A run still going after this is
// assumed crashed and may be claimed again.
export const DEFAULT_LOCK_MINUTES = 30;

// A scheduled sync isn't queued while another run of the same integration
// started less than this long ago and hasn't finished.
const SYNC_IN_FLIGHT_MINUTES = 120;

export const JOB_DEFINITIONS = {
  "sharepoint.sync": {
    label: "SharePoint sync",
    description: "Picks up new and changed files from the connected SharePoint sites, same as Sync Now.",
    defaultIntervalMinutes: 60,
    async appliesTo({ prisma, orgId }) {
      const integration = await prisma.orgIntegration.findUnique({
        where: { orgId_provider: { orgId, provider: "sharepoint" } },
        select: { status: true },
      });
      return integration?.status === "connected";
    },
    async run({ prisma, orgId, enqueue }) {
      const integration = await prisma.orgIntegration.findUnique({
        where: { orgId_provider: { orgId, provider: "sharepoint" } },
        select: { id: true, status: true },
      });
      if (integration?.status !== "connected") return { skipped: "SharePoint isn't connected" };

      const inFlight = await prisma.syncRun.findFirst({
        where: {
          integrationId: integration.id,
          status: "running",
          startedAt: { gt: new Date(Date.now() - SYNC_IN_FLIGHT_MINUTES * 60_000) },
        },
        select: { id: true },
      });
      if (inFlight) return { skipped: "A sync is already running", syncRunId: inFlight.id };

      const syncRun = await prisma.syncRun.create({
        data: { integrationId: integration.id, status: "running", trigger: "scheduled" },
      });
      await enqueue({ type: "sharepoint_sync", integrationId: integration.id, syncRunId: syncRun.id });
      return { syncRunId: syncRun.id };
    },
  },
};

export function jobKey(name, orgId) {
  return `${name}:${orgId ?? "global"}`;
}

/**
 * Make sure this org has a row for every job that applies to it. New rows
 * start disabled, so nothing runs until an admin turns it on.
 */
export async function ensureOrgJobs(prisma, orgId) {
  for (const [name, def] of Object.entries(JOB_DEFINITIONS)) {
    if (!(await def.appliesTo({ prisma, orgId }))) continue;
    await prisma.scheduledJob.upsert({
      where: { key: jobKey(name, orgId) },
      update: {},
      create: {
        key: jobKey(name, orgId),
        name,
        orgId,
        intervalMinutes: def.defaultIntervalMinutes,
        enabled: false,
        nextRunAt: new Date(Date.now() + def.defaultIntervalMinutes * 60_000),
      },
    });
  }
}
