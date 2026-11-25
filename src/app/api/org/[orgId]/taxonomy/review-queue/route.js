import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { resolveOrgRole, isSuperAdmin } from '@/lib/orgGuard';
import { logAudit } from '@/lib/auditLog';

async function auth(orgId) {
  const session = await getServerSession();
  if (!session?.user?.email) return null;
  const actor = await resolveOrgRole(session.user.email, orgId);
  return actor.user && isSuperAdmin(actor.role) ? actor : null;
}
export async function GET(_req, { params }) {
  const { orgId } = await params;
  if (!await auth(orgId)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const suggestions = await prisma.documentTerm.findMany({
    where: { status: 'suggested', source: 'auto', document: { orgId, deletedAt: null } },
    select: { id: true, documentId: true, confidence: true, document: { select: { filename: true } }, field: { select: { name: true } }, term: { select: { label: true } } },
    orderBy: { createdAt: 'desc' }, take: 100,
  });
  return NextResponse.json({ suggestions });
}
export async function PATCH(req, { params }) {
  const { orgId } = await params;
  const actor = await auth(orgId);
  if (!actor) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  if (typeof body.id !== 'string' || !['accept', 'dismiss'].includes(body.action)) return NextResponse.json({ error: 'Invalid review' }, { status: 400 });
  try {
    await prisma.$transaction(async tx => {
      const item = await tx.documentTerm.findFirst({ where: { id: body.id, source: 'auto', status: 'suggested', document: { orgId, deletedAt: null } }, select: { documentId: true, fieldId: true } });
      if (!item) throw new Error('NOT_PENDING');
      await tx.$queryRaw`SELECT id FROM "Document" WHERE id = ${item.documentId} FOR UPDATE`;
      const pending = await tx.documentTerm.findFirst({ where: { id: body.id, status: 'suggested', source: 'auto' } });
      if (!pending) throw new Error('NOT_PENDING');
      if (body.action === 'accept') {
        const field = await tx.metadataField.findUnique({ where: { id: item.fieldId }, select: { multi: true } });
        if (!field?.multi) {
          const occupied = await tx.documentTerm.count({ where: { documentId: item.documentId, fieldId: item.fieldId, status: 'accepted', id: { not: body.id } } });
          if (occupied) throw new Error('FIELD_OCCUPIED');
        }
        await tx.documentTerm.update({ where: { id: body.id }, data: { status: 'accepted', acceptedById: actor.user.id, acceptedAt: new Date() } });
      } else {
        await tx.documentTerm.delete({ where: { id: body.id } });
      }
    });
  } catch (e) {
    if (['NOT_PENDING', 'FIELD_OCCUPIED'].includes(e.message)) return NextResponse.json({ error: e.message }, { status: 409 });
    throw e;
  }
  await logAudit({ orgId, actorUserId: actor.user.id, action: `taxonomy.suggestion.${body.action}`, entityType: 'DocumentTerm', entityId: body.id });
  return NextResponse.json({ reviewed: true });
}
