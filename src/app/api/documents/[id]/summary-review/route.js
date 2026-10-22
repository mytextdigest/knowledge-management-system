import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { resolveOrgRole } from '@/lib/orgGuard';
import { summaryHash, effectiveSummaryStatus, validateSummaryEdit } from '@/lib/governance/summaryReview.mjs';
import { AUDIT_EVENTS } from '@/lib/audit/events';

const fail = (error, status) => NextResponse.json({ error }, { status });
async function authorize(email, id) {
  const doc = await prisma.document.findFirst({ where: { id, scope: 'repository', deletedAt: null },
    select: { id: true, orgId: true, summary: true, summaryReview: true } });
  if (!doc?.orgId) return { error: fail('Not found', 404) };
  const { user, role } = await resolveOrgRole(email, doc.orgId);
  if (!user || role !== 'super_admin') return { error: fail('Forbidden', 403) };
  return { doc, user };
}
export async function GET(_req, { params }) {
  const session = await getServerSession();
  if (!session?.user?.email) return fail('Unauthorized', 401);
  const { id } = await params;
  const auth = await authorize(session.user.email, id);
  if (auth.error) return auth.error;
  return NextResponse.json({ documentId: id, summary: auth.doc.summary,
    status: effectiveSummaryStatus(auth.doc.summary, auth.doc.summaryReview) });
}
export async function PATCH(req, { params }) {
  const session = await getServerSession();
  if (!session?.user?.email) return fail('Unauthorized', 401);
  const { id } = await params;
  const auth = await authorize(session.user.email, id);
  if (auth.error) return auth.error;
  const { doc, user } = auth;
  let body; try { body = await req.json(); } catch { return fail('Invalid JSON', 400); }
  if (!body || !['approve', 'edit'].includes(body.action) || typeof body.expectedSummaryHash !== 'string')
    return fail('action and expectedSummaryHash required', 400);
  if (!doc.summary?.trim()) return fail('Summary unavailable', 409);
  if (summaryHash(doc.summary) !== body.expectedSummaryHash) return fail('Summary changed; reload', 409);
  if (body.action === 'edit' && !validateSummaryEdit(body.summary)) return fail('Invalid summary (1–30000 characters)', 400);
  const nextSummary = body.action === 'edit' ? body.summary.trim() : doc.summary;
  if (body.action === 'edit' && nextSummary === doc.summary) return fail('No summary changes', 400);
  try {
    const result = await prisma.$transaction(async (tx) => {
      // A serializable transaction plus a compare-and-swap guards concurrent edits.
      const current = await tx.document.findFirst({ where: { id, orgId: doc.orgId, scope: 'repository', deletedAt: null },
        select: { summary: true } });
      if (!current || current.summary !== doc.summary) throw new Error('SUMMARY_CONFLICT');
      if (body.action === 'edit') {
        const changed = await tx.document.updateMany({
          where: { id, orgId: doc.orgId, scope: 'repository', deletedAt: null, summary: doc.summary },
          data: { summary: nextSummary },
        });
        if (changed.count !== 1) throw new Error('SUMMARY_CONFLICT');
      } else {
        // Lock the document row to serialize approval against regeneration/edit.
        await tx.$queryRaw`SELECT id FROM "Document" WHERE id = ${id} AND "orgId" = ${doc.orgId} AND summary = ${doc.summary} FOR UPDATE`;
        const fresh = await tx.document.findUnique({ where: { id }, select: { summary: true, deletedAt: true } });
        if (fresh?.deletedAt || fresh?.summary !== doc.summary) throw new Error('SUMMARY_CONFLICT');
      }
      const oldReview = await tx.documentSummaryReview.findUnique({ where: { documentId: id } });
      if (body.action === 'approve' && effectiveSummaryStatus(doc.summary, oldReview) === 'approved')
        throw new Error('SUMMARY_ALREADY_APPROVED');
      const review = await tx.documentSummaryReview.upsert({ where: { documentId: id },
        create: { documentId: id, orgId: doc.orgId, summaryHash: summaryHash(nextSummary),
          status: body.action === 'approve' ? 'approved' : 'pending',
          reviewedById: body.action === 'approve' ? user.id : null,
          reviewedAt: body.action === 'approve' ? new Date() : null },
        update: { summaryHash: summaryHash(nextSummary), status: body.action === 'approve' ? 'approved' : 'pending',
          reviewedById: body.action === 'approve' ? user.id : null,
          reviewedAt: body.action === 'approve' ? new Date() : null },
      });
      await tx.auditLog.create({ data: { orgId: doc.orgId, actorUserId: user.id,
        action: body.action === 'approve' ? AUDIT_EVENTS.DOCUMENT_SUMMARY_APPROVED : AUDIT_EVENTS.DOCUMENT_SUMMARY_EDITED,
        entityType: 'document', entityId: id,
        metadata: { reviewId: review.id, oldHash: summaryHash(doc.summary), newHash: summaryHash(nextSummary) } } });
      return { status: review.status, summary: nextSummary };
    }, { isolationLevel: 'Serializable' });
    return NextResponse.json(result);
  } catch (error) {
    if (['SUMMARY_CONFLICT', 'SUMMARY_ALREADY_APPROVED'].includes(error.message) || error.code === 'P2034')
      return fail('Summary changed or already approved; reload and retry', 409);
    console.error('Summary review failed', error);
    return fail('Unable to update summary review', 500);
  }
}
