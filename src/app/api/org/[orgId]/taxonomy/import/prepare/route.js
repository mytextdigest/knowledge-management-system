import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { resolveOrgRole, isSuperAdmin } from '@/lib/orgGuard';
import { prepareImportApply } from '@/lib/taxonomy/import/applyGuard.mjs';
import { MAX_IMPORT_BYTES } from '@/lib/taxonomy/import/preview.mjs';
import { loadImportTarget } from '@/lib/taxonomy/import/target.mjs';

export const runtime = 'nodejs';
const fail = (error, status) => NextResponse.json({ error }, { status });
const SHOWN_ACTIONS = 500;

/**
 * C-7 dry run. POST { termSetId | newSetName, format, content } returns the
 * changes an import would make and a confirmation token bound to this file
 * and the term set as it is now. Writes nothing.
 */
export async function POST(req, { params }) {
  const { orgId } = await params;
  const session = await getServerSession();
  if (!session?.user?.email) return fail('Unauthorized', 401);
  const actor = await resolveOrgRole(session.user.email, orgId);
  if (!actor.user || !isSuperAdmin(actor.role)) return fail('Forbidden', 403);
  if (Number(req.headers.get('content-length')) > MAX_IMPORT_BYTES * 2) return fail('File too large (8 MB at most)', 413);
  let body; try { body = await req.json(); } catch { return fail('Invalid JSON', 400); }
  const target = await loadImportTarget(prisma, orgId, body);
  if (target.error) return fail(target.error, target.status);
  try {
    const prepared = prepareImportApply({ termSetId: target.key, format: body.format, content: body.content, terms: target.terms });
    const changes = prepared.actions.filter((a) => a.type !== 'unchanged');
    return NextResponse.json({
      termSetId: target.termSetId, newSetName: target.newSetName,
      format: prepared.format, count: prepared.count, summary: prepared.summary, warnings: prepared.warnings,
      scheme: prepared.scheme, schemeLabel: prepared.schemeLabel, relations: prepared.relations,
      changes: changes.slice(0, SHOWN_ACTIONS).map((a) => ({
        type: a.type, externalId: a.externalId, renamed: !!a.renamed,
        before: a.before ? { label: a.before.label } : null, after: a.after ? { label: a.after.label } : null,
      })),
      changesShown: Math.min(changes.length, SHOWN_ACTIONS), changesTotal: changes.length,
      confirmationToken: prepared.confirmationToken,
    });
  } catch (e) {
    return fail(e.message || 'Invalid import file', 400);
  }
}
