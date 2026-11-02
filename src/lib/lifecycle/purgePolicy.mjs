/** Pure, fail-closed policy for B-9 retention purge planning. */
export function isEligibleForPurge(doc, now = new Date()) {
  if (!doc || !doc.deletedAt || !doc.purgeAfter || !doc.orgId) return false;
  const deleted = new Date(doc.deletedAt).getTime();
  const deadline = new Date(doc.purgeAfter).getTime();
  const current = new Date(now).getTime();
  return [deleted, deadline, current].every(Number.isFinite) && deadline > deleted && deadline <= current;
}

// Conversations about the document are purged with it (as the pre-B-9 hard
// delete did) and its decision-evidence rows go with it (the decisions stay), so
// neither blocks. A purged successor would silently un-supersede a live
// document, so that does (pass only non-deleted superseded documents).
export function purgeBlockers(doc) {
  const blockers = [];
  if (doc?.supersedes?.length) blockers.push('referenced_as_successor');
  if (doc?.workflowInstances?.some(w => w.status === 'in_review')) blockers.push('open_workflow');
  if (doc?.reviewRecords?.some(r => r.status === 'pending')) blockers.push('pending_review');
  return blockers;
}

export function createPurgePlan(doc, now = new Date()) {
  const eligible = isEligibleForPurge(doc, now);
  const blockers = purgeBlockers(doc);
  return {
    documentId: doc?.id ?? null,
    orgId: doc?.orgId ?? null,
    eligible,
    blocked: !eligible || blockers.length > 0,
    blockers: !eligible ? ['retention_not_elapsed_or_invalid', ...blockers] : blockers,
    objectKeys: [...new Set([doc?.filePath, ...(doc?.versions ?? []).map(v => v.filePath)].filter(Boolean))],
    chunkCount: doc?._count?.chunks ?? 0,
    versionCount: doc?._count?.versions ?? 0,
  };
}
