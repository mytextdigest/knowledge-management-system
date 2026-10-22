import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { resolveOrgRole } from '@/lib/orgGuard';
import { effectiveSummaryStatus } from '@/lib/governance/summaryReview.mjs';

export async function GET(req, { params }) {
  const session = await getServerSession();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { orgId } = await params;
  const { user, role } = await resolveOrgRole(session.user.email, orgId);
  if (!user || role !== 'super_admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const docs = await prisma.document.findMany({
    where: { orgId, scope: 'repository', deletedAt: null, summary: { not: null } },
    select: { id: true, filename: true, summary: true, departmentId: true,
      summaryReview: { select: { status: true, summaryHash: true, reviewedAt: true } } },
    orderBy: { createdAt: 'desc' }, take: 200,
  });
  const items = docs.map(({ summaryReview, ...d }) => ({
    ...d, reviewStatus: effectiveSummaryStatus(d.summary, summaryReview),
    reviewedAt: summaryReview?.reviewedAt ?? null,
  })).filter((d) => d.reviewStatus !== 'unavailable');
  return NextResponse.json({ items, pendingCount: items.filter((d) => d.reviewStatus === 'pending').length,
    note: 'Latest 200 repository documents with summaries; not a full organization-wide count.' });
}
