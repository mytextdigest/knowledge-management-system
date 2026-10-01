// Rank 16 — Topic Evolution Tracking (Milestone 17)
//
// RBAC and read helpers for `TopicSnapshot` (FR-3 Topic Trend View). Framework-agnostic
// (`prisma` passed in) so it's usable from both a Next.js API route and a plain script/test,
// matching the existing src/lib/expertDiscoveryQuery.mjs convention.
//
// RBAC design note (see REQUIREMENTS_TOPIC_EVOLUTION_TRACKING.md's Non-Functional
// Requirements and FR-4): a live topic's document set can be queried directly via
// TopicDocument, but a *retired* topic's TopicDocument rows are cascade-deleted along
// with its Topic row. To satisfy "a topic's trend data must not be visible to a user who
// couldn't access the underlying documents contributing to it" for a topic that no longer
// exists, `TopicSnapshot` denormalizes each capture's contributing-document department
// footprint (`departmentIds`, `hasUnrestrictedDoc`) so access can be evaluated purely from
// snapshot rows, without a live join. Access is granted if the union of that footprint across
// every snapshot ever captured for a `topicRef` shows at least one always-public document, or
// the viewer belongs to at least one department that ever contributed — the same "any
// accessible document" permissiveness used by getAccessibleRelatedDocuments/accessSql
// elsewhere in this codebase, not a stricter "every department" rule.

const DEFAULT_HISTORY_LIMIT = 104; // ~2 years of weekly snapshots

export async function isTopicSnapshotAccessibleWithPrisma(prisma, { userId, isSuperAdmin = false, topicRef }) {
  if (isSuperAdmin) return true;
  if (!topicRef) return false;

  const rows = await prisma.topicSnapshot.findMany({
    where: { topicRef },
    select: { departmentIds: true, hasUnrestrictedDoc: true },
  });
  if (!rows.length) return false;
  if (rows.some((r) => r.hasUnrestrictedDoc)) return true;

  const departmentIds = [...new Set(rows.flatMap((r) => r.departmentIds || []))];
  if (!departmentIds.length) return false;

  const membership = await prisma.departmentMember.findFirst({
    where: { userId, departmentId: { in: departmentIds } },
    select: { id: true },
  });
  return Boolean(membership);
}

function topKeywordSet(keywordSummary) {
  if (!keywordSummary || typeof keywordSummary !== "object") return new Set();
  return new Set(Object.keys(keywordSummary));
}

// Simple keyword-set diff between two chronologically adjacent snapshots (17-A decision 4).
function vocabularyDrift(previous, current) {
  const prevKeys = topKeywordSet(previous?.keywordSummary);
  const currKeys = topKeywordSet(current?.keywordSummary);
  return {
    added: [...currKeys].filter((k) => !prevKeys.has(k)),
    dropped: [...prevKeys].filter((k) => !currKeys.has(k)),
  };
}

/**
 * Full trend series for one logical topic (grouped by topicRef, which survives the
 * underlying Topic row's deletion). Returns null if the caller isn't authorized, or if
 * no snapshot has ever been captured for this ref.
 */
export async function getTopicTrendWithPrisma(prisma, { topicRef, userId, isSuperAdmin = false, limit = DEFAULT_HISTORY_LIMIT }) {
  const accessible = await isTopicSnapshotAccessibleWithPrisma(prisma, { userId, isSuperAdmin, topicRef });
  if (!accessible) return null;

  const snapshots = await prisma.topicSnapshot.findMany({
    where: { topicRef },
    orderBy: { periodStart: "asc" },
    take: Math.max(2, Math.min(500, Number(limit) || DEFAULT_HISTORY_LIMIT)),
    select: {
      periodStart: true, capturedAt: true, documentCount: true, expertCount: true,
      keywordSummary: true, topicId: true, topicName: true,
    },
  });
  if (!snapshots.length) return null;

  const latest = snapshots[snapshots.length - 1];
  const series = snapshots.map((snap, i) => ({
    periodStart: snap.periodStart,
    capturedAt: snap.capturedAt,
    documentCount: snap.documentCount,
    expertCount: snap.expertCount,
    vocabularyDrift: i === 0 ? { added: [], dropped: [] } : vocabularyDrift(snapshots[i - 1], snap),
  }));

  return {
    topicRef,
    topicName: latest.topicName,
    retired: latest.topicId === null,
    hasEnoughHistory: snapshots.length >= 2,
    snapshotCount: snapshots.length,
    series,
  };
}

/**
 * List of every topicRef the viewer can see at least a "not enough history yet" state
 * for, sorted by most recently captured — powers the Topic Evolution browse page. Includes
 * retired topics (topicId null) since that history is exactly what FR-4 requires stay
 * visible and labeled, not just live ones already reachable from the Experts page.
 */
export async function getAccessibleTopicTrendsWithPrisma(prisma, { orgId, userId, isSuperAdmin = false, limit = 100 }) {
  const safeLimit = Math.max(1, Math.min(250, Number(limit) || 100));

  const latestPerTopic = await prisma.$queryRaw`
    SELECT DISTINCT ON (ts."topicRef")
      ts."topicRef" AS "topicRef", ts."topicId" AS "topicId", ts."topicName" AS "topicName",
      ts.scope AS scope, ts."document_count" AS "documentCount", ts."expert_count" AS "expertCount",
      ts."captured_at" AS "capturedAt"
    FROM "TopicSnapshot" ts
    WHERE ts."orgId" = ${orgId}
    ORDER BY ts."topicRef", ts."captured_at" DESC
  `;
  if (!latestPerTopic.length) return [];

  const refs = latestPerTopic.map((t) => t.topicRef);
  const footprints = await prisma.topicSnapshot.findMany({
    where: { topicRef: { in: refs } },
    select: { topicRef: true, departmentIds: true, hasUnrestrictedDoc: true },
  });
  const footprintByRef = new Map();
  for (const row of footprints) {
    const current = footprintByRef.get(row.topicRef) || { hasUnrestrictedDoc: false, departmentIds: new Set() };
    current.hasUnrestrictedDoc = current.hasUnrestrictedDoc || row.hasUnrestrictedDoc;
    for (const id of row.departmentIds || []) current.departmentIds.add(id);
    footprintByRef.set(row.topicRef, current);
  }

  let allowedDepartmentIds = null;
  if (!isSuperAdmin) {
    const memberships = await prisma.departmentMember.findMany({ where: { userId }, select: { departmentId: true } });
    allowedDepartmentIds = new Set(memberships.map((m) => m.departmentId));
  }

  const accessible = latestPerTopic.filter((topic) => {
    if (isSuperAdmin) return true;
    const footprint = footprintByRef.get(topic.topicRef);
    if (!footprint) return false;
    if (footprint.hasUnrestrictedDoc) return true;
    for (const id of footprint.departmentIds) if (allowedDepartmentIds.has(id)) return true;
    return false;
  });

  return accessible
    .sort((a, b) => new Date(b.capturedAt) - new Date(a.capturedAt))
    .slice(0, safeLimit)
    .map((t) => ({ ...t, retired: t.topicId === null }));
}
