import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { resolveOrgRole } from '@/lib/orgGuard';
import { PATCH as approveSingle } from '@/app/api/documents/[id]/summary-review/route';

// Reuse the single-document authorization, hash comparison, serializable transaction,
// and per-document audit event. No partial success is hidden from the caller.
export async function POST(req, { params }) {
  const session = await getServerSession();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { orgId } = await params;
  const { user, role } = await resolveOrgRole(session.user.email, orgId);
  if (!user || role !== 'super_admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  let body;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  if (!Array.isArray(body?.items) || body.items.length < 1 || body.items.length > 50 ||
      body.items.some(x => typeof x?.id !== 'string' || typeof x?.expectedSummaryHash !== 'string') ||
      new Set(body.items.map(x => x.id)).size !== body.items.length)
    return NextResponse.json({ error: 'Provide 1–50 unique document IDs and summary hashes' }, { status: 400 });
  const owned = await prisma.document.findMany({ where: { id: { in: body.items.map(x => x.id) }, orgId, scope: 'repository', deletedAt: null }, select: { id: true } });
  const allowed = new Set(owned.map(d => d.id));
  const results = [];
  for (const item of body.items) {
    if (!allowed.has(item.id)) { results.push({ id: item.id, status: 404 }); continue; }
    const subRequest = new Request(req.url, { method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'approve', expectedSummaryHash: item.expectedSummaryHash }) });
    const response = await approveSingle(subRequest, { params: Promise.resolve({ id: item.id }) });
    results.push({ id: item.id, status: response.status });
  }
  return NextResponse.json({ approved: results.filter(x => x.status === 200).length, results },
    { status: results.every(x => x.status === 200) ? 200 : 207 });
}
