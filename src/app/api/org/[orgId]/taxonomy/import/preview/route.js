import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { resolveOrgRole, isSuperAdmin } from '@/lib/orgGuard';
import { buildImportPreview, MAX_IMPORT_BYTES } from '@/lib/taxonomy/import/preview.mjs';

export const runtime = 'nodejs';
const reply = (error, status) => NextResponse.json({ error }, { status });

/** POST JSON { termSetId, format, content }. Strictly read-only: no TaxonomyImport row created. */
export async function POST(req, { params }) {
  const { orgId } = await params;
  const session = await getServerSession();
  if (!session?.user?.email) return reply('Unauthorized', 401);
  const actor = await resolveOrgRole(session.user.email, orgId);
  if (!actor.user || !isSuperAdmin(actor.role)) return reply('Forbidden', 403);
  const size = Number(req.headers.get('content-length'));
  if (Number.isFinite(size) && size > MAX_IMPORT_BYTES * 2) return reply('Request too large', 413);
  let body;
  try { body = await req.json(); } catch { return reply('Invalid JSON', 400); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return reply('Invalid request', 400);
  if (typeof body.termSetId !== 'string' || !body.termSetId) return reply('termSetId is required', 400);
  const set = await prisma.termSet.findFirst({ where: { id: body.termSetId, orgId }, select: { id: true, source: true, readOnly: true } });
  if (!set) return reply('Term set not found', 404);
  // Preview can read an external managed set; local sets must not be silently converted.
  if (set.source !== 'external' || !set.readOnly) return reply('Only external read-only term sets can be synchronized', 409);
  const terms = await prisma.term.findMany({ where: { termSetId: set.id },
    select: { id: true, externalId: true, parentId: true, label: true, description: true, status: true } });
  try {
    const preview = buildImportPreview({ format: body.format, content: body.content, terms });
    return NextResponse.json({ termSetId: set.id, ...preview, previewOnly: true });
  } catch (error) {
    return reply(error instanceof Error ? error.message : 'Invalid import', 400);
  }
}
