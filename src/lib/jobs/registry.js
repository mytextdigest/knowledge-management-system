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
//   lockMinutes (optional)        how long a run may take before it's assumed
//                                 crashed (default DEFAULT_LOCK_MINUTES)
//   minIntervalMinutes (optional) the shortest interval an admin may pick, for
//                                 jobs too heavy to run every few minutes

import { createAclResolver } from "../connectors/sharepointAcl.js";
import { refreshIntegrationAcls } from "../connectors/sharepointAclRefresh.js";
import { getCachedAppOnlyToken } from "../msGraph.js";

// A-22: down to 5 minutes (NFR-6, NYPA Q&A #99: changes within 5 minutes).
export const INTERVAL_CHOICES = [5, 15, 30, 60, 240, 720, 1440];

/** The intervals an admin may pick for a job. */
export function intervalChoicesFor(name) {
  const min = JOB_DEFINITIONS[name]?.minIntervalMinutes ?? 0;
  return INTERVAL_CHOICES.filter((m) => m >= min);
}

// How long a claimed run holds its lock. A run still going after this is
// assumed crashed and may be claimed again.
export const DEFAULT_LOCK_MINUTES = 30;

// A scheduled sync isn't queued while another run of the same integration
// started less than this long ago and hasn't finished.
const SYNC_IN_FLIGHT_MINUTES = 120;

async function connected(prisma, orgId, provider) {
  const integration = await prisma.orgIntegration.findUnique({
    where: { orgId_provider: { orgId, provider } },
    select: { status: true },
  });
  return integration?.status === "connected";
}

// Queue a sync run of a connected integration (SharePoint, ServiceNow),
// unless one is already in flight.
async function queueSync({ prisma, orgId, enqueue, provider, name }) {
  const integration = await prisma.orgIntegration.findUnique({
    where: { orgId_provider: { orgId, provider } },
    select: { id: true, status: true },
  });
  if (integration?.status !== "connected") return { skipped: `${name} isn't connected` };

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
  await enqueue({ type: `${provider}_sync`, integrationId: integration.id, syncRunId: syncRun.id });
  return { syncRunId: syncRun.id };
}

export const JOB_DEFINITIONS = {
  "sharepoint.sync": {
    label: "SharePoint sync",
    description: "Picks up new and changed files from the connected SharePoint sites, same as Sync Now.",
    defaultIntervalMinutes: 60,
    appliesTo: ({ prisma, orgId }) => connected(prisma, orgId, "sharepoint"),
    run: ({ prisma, orgId, enqueue }) => queueSync({ prisma, orgId, enqueue, provider: "sharepoint", name: "SharePoint" }),
  },

  // A-17: ServiceNow Knowledge Base articles, same as its Sync Now.
  "servicenow.sync": {
    label: "ServiceNow sync",
    description: "Picks up new, changed and retired articles from the mapped ServiceNow knowledge bases, same as Sync Now.",
    defaultIntervalMinutes: 60,
    appliesTo: ({ prisma, orgId }) => connected(prisma, orgId, "servicenow"),
    run: ({ prisma, orgId, enqueue }) => queueSync({ prisma, orgId, enqueue, provider: "servicenow", name: "ServiceNow" }),
  },

  // A-11/A-21: the full daily pass. Re-reads every synced file's SharePoint
  // permissions and re-checks every member's Microsoft identity and groups.
  "sharepoint.acl-refresh": {
    label: "SharePoint permissions refresh",
    description:
      "Re-reads every synced file's and page's SharePoint permissions and re-checks which Microsoft account each member has. Sharing changes are also picked up by every sync; this is the daily safety net.",
    defaultIntervalMinutes: 1440,
    minIntervalMinutes: 60, // re-reads every file; syncs already pick up sharing changes
    lockMinutes: 180,
    appliesTo: ({ prisma, orgId }) => connected(prisma, orgId, "sharepoint"),
    async run({ prisma, orgId }) {
      const integration = await prisma.orgIntegration.findUnique({
        where: { orgId_provider: { orgId, provider: "sharepoint" } },
      });
      if (integration?.status !== "connected") return { skipped: "SharePoint isn't connected" };
      const tenantId = integration.scopeConfig?.tenantId;
      const accessToken = await getCachedAppOnlyToken(tenantId);
      const resolver = createAclResolver({ graphToken: accessToken, tenantId });
      const result = await refreshIntegrationAcls(prisma, { integration, accessToken, resolver });
      return resolver ? result : { ...result, warning: "SharePoint certificate not configured: file permissions not refreshed" };
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
