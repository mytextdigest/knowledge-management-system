import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { resolveOrgRole } from '@/lib/orgGuard';
import { publishingCompleteness, PUBLISH_SELECT } from '@/lib/governance/publishGate';

export async function GET(_req, { params }) {
  const session = await getServerSession();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const doc = await prisma.document.findFirst({
    where: { id, scope: 'repository', deletedAt: null }, select: PUBLISH_SELECT,
  });
  if (!doc?.orgId) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const { user, role } = await resolveOrgRole(session.user.email, doc.orgId);
  if (!user || !role) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  // Same-department access for department admins; organization members see
  // completeness metadata only, not document contents.
  const completeness = await publishingCompleteness(doc);
  return NextResponse.json({ documentId: id, lifecycle: doc.lifecycle, completeness });
}
