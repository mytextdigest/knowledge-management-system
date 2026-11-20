import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { resolveOrgRole, isSuperAdmin } from '@/lib/orgGuard';
import { logAudit } from '@/lib/auditLog';
import { MAX_IMPORT_BYTES } from '@/lib/taxonomy/import/preview.mjs';
import { applyImportedTaxonomy } from '@/lib/taxonomy/import/applyDb.mjs';
import { loadImportTarget } from '@/lib/taxonomy/import/target.mjs';
import { getFieldMap, reconcileMappedDocuments } from '@/lib/taxonomy/import/sourceTagMap.mjs';

export const runtime = 'nodejs';
export const maxDuration = 300;
const fail = (error, status) => NextResponse.json({ error }, { status });

/**
 * C-6/C-7 apply. POST { termSetId | newSetName, format, content,
 * confirmationToken, confirmApply: true }. The token from /prepare must
 * still match the file and the term set, or nothing is written.
 */
export async function POST(req, { params }) {
  const { orgId } = await params;
  const session = await getServerSession();
  if (!session?.user?.email) return fail('Unauthorized', 401);
  const actor = await resolveOrgRole(session.user.email, orgId);
  if (!actor.user || !isSuperAdmin(actor.role)) return fail('Forbidden', 403);
  if (Number(req.headers.get('content-length')) > MAX_IMPORT_BYTES * 2) return fail('File too large (8 MB at most)', 413);
  let body; try { body = await req.json(); } catch { return fail('Invalid JSON', 400); }
  if (body?.confirmApply !== true || typeof body.confirmationToken !== 'string') return fail('Preview the import and confirm it first', 400);
  const target = await loadImportTarget(prisma, orgId, body);
  if (target.error) return fail(target.error, target.status);

  let result;
  try {
    result = await prisma.$transaction((tx) => applyImportedTaxonomy(tx, {
      orgId, termSetId: target.termSetId, newSetName: target.newSetName, format: body.format,
      content: body.content, confirmationToken: body.confirmationToken, actorUserId: actor.user.id,
    }), { maxWait: 10_000, timeout: 240_000 });
  } catch (error) {
    if (error?.code === 'P2002' || error?.code === 'P2034') return fail('Another change happened at the same time; preview again', 409);
    const message = error?.message || '';
    if (/stale|changed|not found|read-only|preview again/i.test(message)) return fail(message, 409);
    if (/required|Invalid|Unsupported|Cycle|Duplicate|Missing|label|limit|exceeds|Too many|Turtle|XML|CSV|Row /i.test(message)) return fail(message, 400);
    console.error('Taxonomy import apply failed', error);
    return fail('Import failed; nothing was changed', 500);
  }

  await logAudit({
    orgId, actorUserId: actor.user.id, action: 'taxonomy.external_import.applied', entityType: 'TermSet', entityId: result.termSetId,
    after: { importId: result.importId, format: body.format, created: result.created, summary: result.summary },
  });

  // C-8 on import: synced SharePoint tags in columns mapped to a field on this
  // set are brought in as terms (first batch here; "Map now" continues).
  let tagMapping = null;
  try {
    const map = await getFieldMap(prisma, orgId);
    const fields = await prisma.metadataField.findMany({ where: { orgId, termSetId: result.termSetId }, select: { id: true } });
    const ids = new Set(fields.map((f) => f.id));
    const mapping = Object.fromEntries(Object.entries(map).filter(([, fieldId]) => ids.has(fieldId)));
    if (Object.keys(mapping).length) tagMapping = await reconcileMappedDocuments(prisma, { orgId, mapping, limit: 500 });
  } catch (error) {
    console.warn('C-8 mapping after import failed:', error?.message);
  }
  return NextResponse.json({ applied: true, ...result, tagMapping });
}
