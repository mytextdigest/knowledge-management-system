// C-10: organizational topics proposed as taxonomy terms, reviewed by super_admin.
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { resolveOrgRole, isSuperAdmin } from '@/lib/orgGuard';
import { cleanLabel, normalizeLabel } from '@/lib/taxonomy/labels.mjs';
import { logAudit } from '@/lib/auditLog';
const bad = (error, status = 400) => NextResponse.json({ error }, { status });
async function authorize(orgId) {
  const session = await getServerSession();
  if (!session?.user?.email) return { error: bad('Unauthorized', 401) };
  const a = await resolveOrgRole(session.user.email, orgId);
  return a.user && isSuperAdmin(a.role) ? a : { error: bad('Forbidden', 403) };
}
export async function GET(_req, { params }) {
  const { orgId } = await params; const a = await authorize(orgId); if (a.error) return a.error;
  const candidates = await prisma.termCandidate.findMany({ where: { orgId }, orderBy: { createdAt: 'desc' }, take: 100 });
  return NextResponse.json({ candidates });
}
export async function POST(req, { params }) {
  const { orgId } = await params; const a = await authorize(orgId); if (a.error) return a.error;
  const b = await req.json().catch(() => ({}));
  if (typeof b.termSetId !== 'string') return bad('termSetId required');
  const set = await prisma.termSet.findFirst({ where: { id: b.termSetId, orgId, readOnly: false } });
  if (!set) return bad('Editable term set not found', 404);
  const topics = await prisma.topic.findMany({ where: { orgId, scope: 'org' }, select: { id: true, name: true }, take: 200 });
  let created = 0;
  for (const topic of topics) {
    const label = cleanLabel(topic.name);
    if (!label) continue;
    const normalizedLabel = normalizeLabel(label);
    const existing = await prisma.term.findFirst({ where: { termSetId: set.id, normalizedLabel }, select: { id: true } });
    if (existing) continue;
    const candidate = await prisma.termCandidate.upsert({ where: { orgId_normalizedLabel: { orgId, normalizedLabel } },
      create: { orgId, topicId: topic.id, label, normalizedLabel, suggestedTermSetId: set.id }, update: {} });
    if (candidate.topicId === topic.id) created++;
  }
  return NextResponse.json({ proposed: created });
}
export async function PATCH(req, { params }) {
  const { orgId } = await params; const a = await authorize(orgId); if (a.error) return a.error;
  const b = await req.json().catch(() => ({}));
  if (typeof b.id !== 'string' || !['accept', 'dismiss'].includes(b.action)) return bad('Invalid action');
  const candidate = await prisma.termCandidate.findFirst({ where: { id: b.id, orgId, status: 'pending' } });
  if (!candidate) return bad('Pending candidate not found', 404);
  let termId = null;
  try {
    await prisma.$transaction(async tx => {
      // Lock the candidate before checking its state; serialize approvals for a label.
      await tx.$queryRaw`SELECT id FROM "TermCandidate" WHERE id = ${candidate.id} FOR UPDATE`;
      const pending = await tx.termCandidate.findFirst({ where: { id: candidate.id, orgId, status: 'pending' } });
      if (!pending) throw new Error('ALREADY_REVIEWED');
      if (b.action === 'accept') {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${orgId}), hashtext(${candidate.normalizedLabel}))`;
        const set = await tx.termSet.findFirst({ where: { id: candidate.suggestedTermSetId, orgId, readOnly: false } });
        if (!set) throw new Error('READ_ONLY');
        const parent = candidate.suggestedParentId ? await tx.term.findFirst({ where: { id: candidate.suggestedParentId, termSetId: set.id, status: 'active' } }) : null;
        if (candidate.suggestedParentId && !parent) throw new Error('INVALID_PARENT');
        const existing = await tx.term.findFirst({ where: { termSetId: set.id, parentId: parent?.id ?? null, normalizedLabel: candidate.normalizedLabel, status: 'active' } });
        const term = existing || await tx.term.create({ data: { termSetId: set.id, parentId: parent?.id ?? null, label: candidate.label, normalizedLabel: candidate.normalizedLabel, depth: parent ? parent.depth + 1 : 0, ancestorIds: parent ? [...parent.ancestorIds, parent.id] : [] } });
        termId = term.id;
      }
      const updated = await tx.termCandidate.updateMany({ where: { id: candidate.id, status: 'pending' }, data: { status: b.action === 'accept' ? 'accepted' : 'dismissed', acceptedTermId: termId, decidedById: a.user.id, decidedAt: new Date() } });
      if (!updated.count) throw new Error('ALREADY_REVIEWED');
    });
  } catch (error) {
    if (['READ_ONLY','INVALID_PARENT','ALREADY_REVIEWED'].includes(error?.message)) return bad(error.message, 409);
    throw error;
  }
  await logAudit({ orgId, actorUserId: a.user.id, action: `taxonomy.candidate.${b.action}`, entityType: 'TermCandidate', entityId: candidate.id, after: { termId } });
  return NextResponse.json({ reviewed: true, termId });
}
