import { prisma } from '../prisma.mjs';
import { notify } from '../notifications/notify.js';
import { AUDIT_EVENTS } from '../audit/events.js';
import { getSetting } from '../settings/index.js';
import { evaluateStaleness, staleCutoff } from './staleContent.mjs';
import { matchesPolicy, reviewerFor } from './reviewCycles.mjs';

// B-19 (E26): the content.stale-scan job (and Settings' "scan now").
// Rules come from the org setting stale.rules ({ noUpdateDays, noViewDays };
// 0 turns a rule off). A stale published document is flagged "may be
// outdated" (lifecycleSuggestion = archived, reason, lifecycleSuggestedAt),
// its owner is notified, and when a review policy matches it gets exactly
// one open review (never a second while one is pending). Nothing is archived
// or deleted: a person decides.
//
// Every published document is checked on every run (bulk queries), so a
// large org isn't stuck re-checking its oldest documents; at most `limit`
// are flagged per run.
const MAX_CANDIDATES = 5000;

export async function scanStaleContent({ orgId, actorUserId = null, limit = 100, now = new Date(), db = prisma, rules }) {
  rules ??= await getSetting(orgId, 'stale.rules');
  const enabled = [rules?.noUpdateDays, rules?.noViewDays].filter((d) => d > 0);
  if (!enabled.length) return { skipped: 'Both stale rules are off', scanned: 0, flagged: 0 };
  // Nothing created after the shortest threshold can be stale yet.
  const youngest = staleCutoff(now, Math.min(...enabled));

  const docs = await db.document.findMany({
    where: { orgId, scope: 'repository', deletedAt: null, lifecycle: 'published',
      lifecycleSuggestion: null, lifecycleSuggestionDismissedAt: null, createdAt: { lte: youngest } },
    select: { id: true, createdAt: true, externalModifiedAt: true, ownerId: true, userId: true, departmentId: true, category: true, stewards: { select: { userId: true } } },
    orderBy: { createdAt: 'asc' }, take: MAX_CANDIDATES,
  });
  if (!docs.length) return { scanned: 0, flagged: 0, skipped: 0 };
  const ids = docs.map((d) => d.id);

  const [views, versions, citations, policies] = await Promise.all([
    db.documentInteraction.groupBy({ by: ['documentId'], where: { orgId, documentId: { in: ids }, type: 'view' }, _max: { createdAt: true } }),
    db.documentVersion.groupBy({ by: ['documentId'], where: { documentId: { in: ids } }, _max: { createdAt: true } }),
    db.$queryRaw`SELECT c.id AS "documentId", max(l."created_at") AS "citedAt"
      FROM "ChatAuditLog" l CROSS JOIN LATERAL unnest(l."citedDocIds") AS c(id)
      WHERE l."orgId" = ${orgId} AND l."citedDocIds" && ${ids}::text[] AND c.id = ANY(${ids}::text[])
      GROUP BY c.id`,
    db.reviewPolicy.findMany({ where: { orgId, active: true }, orderBy: { createdAt: 'asc' } }),
  ]);
  const lastView = new Map(views.map((v) => [v.documentId, v._max.createdAt]));
  const lastVersion = new Map(versions.map((v) => [v.documentId, v._max.createdAt]));
  const lastCited = new Map(citations.map((c) => [c.documentId, c.citedAt]));

  let flagged = 0, skipped = 0, reviews = 0;
  for (const doc of docs) {
    if (flagged >= limit) break;
    const { stale, reasons } = evaluateStaleness({
      createdAt: doc.createdAt, sourceModifiedAt: doc.externalModifiedAt, lastVersionAt: lastVersion.get(doc.id),
      lastViewedAt: lastView.get(doc.id), lastCitedAt: lastCited.get(doc.id),
    }, rules, now);
    if (!stale) { skipped++; continue; }
    const policy = policies.find((p) => matchesPolicy(doc, p));
    const reviewerId = policy ? reviewerFor(doc, policy) : null;
    const result = await db.$transaction(async (tx) => {
      const claim = await tx.document.updateMany({
        where: { id: doc.id, orgId, scope: 'repository', deletedAt: null, lifecycle: 'published',
          lifecycleSuggestion: null, lifecycleSuggestionDismissedAt: null },
        data: { lifecycleSuggestion: 'archived', lifecycleSuggestionReason: reasons.join('; '), lifecycleSuggestedAt: now },
      });
      if (claim.count !== 1) return null;
      let reviewCreated = false;
      if (policy && reviewerId) {
        const member = await tx.organizationMember.findUnique({ where: { orgId_userId: { orgId, userId: reviewerId } }, select: { userId: true } });
        const open = await tx.reviewRecord.findFirst({ where: { orgId, documentId: doc.id, status: 'pending' }, select: { id: true } });
        if (member && !open) {
          const record = await tx.reviewRecord.create({ data: { orgId, documentId: doc.id, policyId: policy.id, reviewerId, dueAt: now } });
          await tx.auditLog.create({ data: { orgId, actorUserId, action: AUDIT_EVENTS.REVIEW_STARTED, entityType: 'document', entityId: doc.id, metadata: { reason: 'stale-content', policyId: policy.id, reviewId: record.id } } });
          reviewCreated = true;
        }
      }
      await tx.auditLog.create({ data: { orgId, actorUserId, action: AUDIT_EVENTS.CONTENT_STALE_FLAGGED,
        entityType: 'document', entityId: doc.id, metadata: { reasons, rules } } });
      return { reviewCreated };
    }, { isolationLevel: 'Serializable' }).catch((e) => { if (e.code === 'P2034') return null; throw e; });
    if (!result) { skipped++; continue; }
    flagged++;
    if (result.reviewCreated) reviews++;
    const link = `/document?id=${encodeURIComponent(doc.id)}`;
    const ownerId = doc.ownerId || doc.userId;
    if (ownerId) await notify({ orgId, userIds: [ownerId], type: 'content.stale', title: 'Document may be outdated',
      body: `${reasons.join('; ')}. Please check it is still correct, or archive it.`, link });
    if (result.reviewCreated && reviewerId !== ownerId) await notify({ orgId, userIds: [reviewerId], type: 'review.due',
      title: 'Stale content review', body: 'Please review this document for outdated information.', link });
  }
  return { scanned: docs.length, flagged, reviews, skipped, rules };
}
