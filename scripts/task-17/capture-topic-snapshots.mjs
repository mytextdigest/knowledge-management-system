// Rank 16 — Topic Evolution Tracking (Milestone 17, Task 17-C)
//
// Standalone, externally-scheduled snapshot capture job — following the same pattern as
// scripts/task-8/flag-stale-documents.mjs and scripts/task-5d/detect-knowledge-gaps.mjs
// (a plain script invoked periodically by whatever ops-level scheduler already runs those,
// not a new in-process interval or cron subsystem — 17-A decision 2). Run weekly
// (17-A decision 1) via `npm run task17:capture-snapshots`, optionally `-- --org=<id>`.
//
// Repository-scope only for v1 (17-A decision 3) — project-scope topics are not snapshotted.
//
// Idempotent per ISO week (FR-2/NFR): upserts on the (topicRef, periodStart) unique
// constraint, so a retried or manually re-triggered run for the same week updates the
// existing row instead of creating a duplicate.
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const TOP_KEYWORDS = 15;

function isoWeekStart(date) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7; // Sunday -> 7, so Monday is always day 1
  if (day !== 1) d.setUTCDate(d.getUTCDate() - (day - 1));
  return d;
}

function topKeywords(distribution, n) {
  if (!distribution || typeof distribution !== "object") return null;
  const entries = Object.entries(distribution)
    .filter(([, weight]) => typeof weight === "number")
    .sort((a, b) => b[1] - a[1])
    .slice(0, n);
  return entries.length ? Object.fromEntries(entries) : null;
}

// A topic keeps the same `topicId` for its whole life (only ever nulled once, on
// deletion), so reusing whatever topicRef its own prior snapshots already used keeps one
// logical topic's history under one ref even if this is not the first capture.
async function resolveTopicRef(topicId) {
  const prior = await prisma.topicSnapshot.findFirst({
    where: { topicId },
    orderBy: { capturedAt: "desc" },
    select: { topicRef: true },
  });
  return prior?.topicRef || topicId;
}

async function main() {
  const orgArg = process.argv.find((a) => a.startsWith("--org="));
  const orgId = orgArg?.split("=")[1] || null;
  const periodStart = isoWeekStart(new Date());

  const topics = await prisma.topic.findMany({
    where: { scope: "repository", ...(orgId ? { orgId } : {}) },
    select: {
      id: true, orgId: true, scope: true, name: true, documentCount: true, keywordDistribution: true,
      topicDocuments: { select: { document: { select: { departmentId: true } } } },
      expertise: { select: { source: true } },
    },
  });

  let written = 0;
  for (const topic of topics) {
    if (!topic.orgId) continue; // defensive only — repository-scope topics always carry orgId

    const topicRef = await resolveTopicRef(topic.id);
    const departmentIds = [...new Set(
      topic.topicDocuments.map((td) => td.document?.departmentId).filter(Boolean)
    )];
    const hasUnrestrictedDoc = topic.topicDocuments.some((td) => !td.document?.departmentId);
    const expertCount = topic.expertise.filter((e) => e.source !== "dismissed").length;
    const keywordSummary = topKeywords(topic.keywordDistribution, TOP_KEYWORDS);

    await prisma.topicSnapshot.upsert({
      where: { topicRef_periodStart: { topicRef, periodStart } },
      create: {
        topicRef, topicId: topic.id, topicName: topic.name, orgId: topic.orgId, scope: topic.scope,
        periodStart, documentCount: topic.documentCount, expertCount, keywordSummary,
        departmentIds, hasUnrestrictedDoc,
      },
      update: {
        topicName: topic.name, documentCount: topic.documentCount, expertCount, keywordSummary,
        departmentIds, hasUnrestrictedDoc,
      },
    });
    written += 1;
  }

  console.log(`Captured ${written} topic snapshot(s) for the week starting ${periodStart.toISOString()}.`);
}

try {
  await main();
} finally {
  await prisma.$disconnect();
}
