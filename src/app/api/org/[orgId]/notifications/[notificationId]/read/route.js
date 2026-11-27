import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { resolveOrgRole } from '@/lib/orgGuard';

export async function PATCH(_req, { params }) {
  const session = await getServerSession();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { orgId, notificationId } = await params;
  const { user, role } = await resolveOrgRole(session.user.email, orgId);
  if (!user || !role) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const result = await prisma.notification.updateMany({
    where: { id: notificationId, orgId, userId: user.id, readAt: null },
    data: { readAt: new Date() },
  });
  if (!result.count) {
    const existing = await prisma.notification.findFirst({ where: { id: notificationId, orgId, userId: user.id }, select: { id: true } });
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
