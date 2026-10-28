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
  if (!user || !['super_admin', 'dept_admin'].includes(role))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  let departmentFilter = {};
  if (role === 'dept_admin') {
    const memberships = await prisma.departmentMember.findMany({
      where: { userId: user.id, role: 'admin', department: { orgId } },
      select: { departmentId: true },
    });
    const departmentIds = memberships.map(m => m.departmentId);
    departmentFilter = { departmentId: { in: departmentIds } };
  }
  const docs = await prisma.document.findMany({
    where: { orgId, scope: 'repository', deletedAt: null, summary: { not: null }, ...departmentFilter },
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
