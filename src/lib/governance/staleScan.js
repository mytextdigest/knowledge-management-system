import { prisma } from '../prisma.mjs';
import { notify } from '../notifications/notify.js';
import { AUDIT_EVENTS } from '../audit/events.js';
import { staleCutoff, isStale, validateStaleScanOptions } from './staleContent.mjs';
import { matchesPolicy, reviewerFor } from './reviewCycles.mjs';

// Explicit administrator-triggered batch; no implicit database writes during page loads.
// Does not archive or delete documents: only suggests archive for human review.
export async function scanStaleContent({ orgId, actorUserId = null, days = 180, limit = 100, now = new Date(), db = prisma }) {
 const opts = validateStaleScanOptions({ days, limit });
 if (opts.error) throw new Error(opts.error);
 const cutoff = staleCutoff(now, days);
 const policies = await db.reviewPolicy.findMany({ where: { orgId, active: true }, orderBy: { createdAt: 'asc' } });
 const docs = await db.document.findMany({
  where: { orgId, scope: 'repository', deletedAt: null, lifecycle: 'published',
   lifecycleSuggestion: null, lifecycleSuggestionDismissedAt: null, createdAt: { lte: cutoff } },
  select: { id: true, createdAt: true, ownerId: true, userId: true, filename: true, departmentId: true, category: true, stewards: { select: { userId: true } } },
  orderBy: { createdAt: 'asc' }, take: limit,
 });
 let flagged = 0, skipped = 0;
 for (const doc of docs) {
  // Citation evidence is scoped to the same organization and the specific document.
  const latest = await db.chatAuditLog.findFirst({
   where: { orgId, citedDocIds: { has: doc.id } },
   orderBy: { createdAt: 'desc' }, select: { createdAt: true },
  });
  if (!isStale(latest?.createdAt ?? doc.createdAt, cutoff)) { skipped++; continue; }
  const policy = policies.find(p => matchesPolicy(doc, p));
  const reviewerId = policy ? reviewerFor(doc, policy) : null;
  const updated = await db.$transaction(async tx => {
   const claim = await tx.document.updateMany({
    where: { id: doc.id, orgId, scope: 'repository', deletedAt: null, lifecycle: 'published',
     lifecycleSuggestion: null, lifecycleSuggestionDismissedAt: null },
    data: { lifecycleSuggestion: 'archived', lifecycleSuggestionReason: `Not cited in organization chat for at least ${days} days`, lifecycleSuggestedAt: now },
   });
   if (claim.count !== 1) return false;
   if (policy && reviewerId) {
    const member = await tx.organizationMember.findUnique({ where: { orgId_userId: { orgId, userId: reviewerId } }, select: { userId: true } });
    const open = await tx.reviewRecord.findFirst({ where: { orgId, documentId: doc.id, status: 'pending' }, select: { id: true } });
    if (member && !open) {
     await tx.reviewRecord.create({ data: { orgId, documentId: doc.id, policyId: policy.id, reviewerId, dueAt: now } });
     await tx.auditLog.create({ data: { orgId, actorUserId, action: AUDIT_EVENTS.REVIEW_STARTED, entityType: 'document', entityId: doc.id, metadata: { reason: 'stale-content', policyId: policy.id } } });
    }
   }
   await tx.auditLog.create({ data: { orgId, actorUserId, action: AUDIT_EVENTS.CONTENT_STALE_FLAGGED,
    entityType: 'document', entityId: doc.id, metadata: { days, cutoff: cutoff.toISOString() } } });
   return true;
  }, { isolationLevel: 'Serializable' });
  if (!updated) { skipped++; continue; }
  flagged++;
  await notify({ orgId, userIds: [doc.ownerId || doc.userId].filter(Boolean), type: 'content.stale',
   title: 'Document may be stale', body: 'This document has not been cited recently. Please review the archive suggestion.',
   link: `/document?id=${encodeURIComponent(doc.id)}` });
  if (policy && reviewerId) await notify({ orgId, userIds: [reviewerId], type: 'review.due', title: 'Stale content review', body: 'Please review this document for outdated information.', link: `/document?id=${encodeURIComponent(doc.id)}` });
 }
 return { scanned: docs.length, flagged, skipped, days };
}
