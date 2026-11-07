import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { resolveOrgRole } from '@/lib/orgGuard';
import { isNotificationType, NOTIFICATION_TYPES } from '@/lib/notifications/types.mjs';

async function auth(orgId) {
  const session = await getServerSession();
  if (!session?.user?.email) return null;
  const { user, role } = await resolveOrgRole(session.user.email, orgId);
  return role ? user : null;
}
export async function GET(_req, { params }) {
  const { orgId } = await params;
  const user = await auth(orgId);
  if (!user) return NextResponse.json({ error: 'Unauthorized or forbidden' }, { status: 403 });
  const stored = await prisma.notificationPreference.findMany({ where: { userId: user.id } });
  const map = new Map(stored.map(p => [p.type, p]));
  return NextResponse.json(NOTIFICATION_TYPES.map(type => ({
    type, inApp: map.get(type)?.inApp ?? true, email: map.get(type)?.email ?? true,
  })));
}
export async function PATCH(req, { params }) {
  const { orgId } = await params;
  const user = await auth(orgId);
  if (!user) return NextResponse.json({ error: 'Unauthorized or forbidden' }, { status: 403 });
  let body;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  if (!body || !isNotificationType(body.type) || typeof body.inApp !== 'boolean' || typeof body.email !== 'boolean')
    return NextResponse.json({ error: 'Invalid preference' }, { status: 400 });
  const result = await prisma.notificationPreference.upsert({
    where: { userId_type: { userId: user.id, type: body.type } },
    update: { inApp: body.inApp, email: body.email },
    create: { userId: user.id, type: body.type, inApp: body.inApp, email: body.email },
  });
  return NextResponse.json({ type: result.type, inApp: result.inApp, email: result.email });
}
