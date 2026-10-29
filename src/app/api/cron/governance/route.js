import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { scanDueReviews } from '@/lib/governance/reviewScan';
import { scanStaleContent } from '@/lib/governance/staleScan';
import { authorizeGovernanceCron } from '@/lib/governance/cronAuth.mjs';

export const runtime = 'nodejs';
export const maxDuration = 60;
export async function GET(request) {
  if (!authorizeGovernanceCron(request.headers.get('authorization'), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const orgs = await prisma.organization.findMany({ select: { id: true }, orderBy: { id: 'asc' }, take: 25 });
  const results = [];
  for (const org of orgs) {
    const admin = await prisma.organizationMember.findFirst({ where: { orgId: org.id, role: 'super_admin' }, select: { userId: true } });
    if (!admin) { results.push({ orgId: org.id, skipped: 'No administrator' }); continue; }
    try {
      const reviews = await scanDueReviews({ orgId: org.id, actorUserId: admin.userId, limit: 100 });
      const stale = await scanStaleContent({ orgId: org.id, actorUserId: admin.userId, limit: 100 });
      results.push({ orgId: org.id, reviews, stale });
    } catch (error) {
      console.error('Governance scheduled scan failed', org.id, error);
      results.push({ orgId: org.id, error: 'Scan failed' });
    }
  }
  return NextResponse.json({ processed: results.length, results });
}
