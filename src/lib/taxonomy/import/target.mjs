import { cleanLabel, normalizeLabel } from '../labels.mjs';
import { importTargetKey } from './applyDb.mjs';

export const IMPORT_FORMATS = ['skos_ttl', 'skos_rdfxml', 'csv'];

/**
 * Resolves an import request's target: an existing external term set
 * (`termSetId`) or a new one (`newSetName`). Returns { key, termSetId,
 * newSetName, terms } or { error, status }.
 */
export async function loadImportTarget(db, orgId, body) {
  if (!body || typeof body !== 'object') return { error: 'Invalid request', status: 400 };
  if (!IMPORT_FORMATS.includes(body.format)) return { error: 'Choose SKOS Turtle, SKOS RDF/XML or CSV', status: 400 };
  if (typeof body.termSetId === 'string' && body.termSetId) {
    const set = await db.termSet.findFirst({ where: { id: body.termSetId, orgId }, select: { id: true, source: true, readOnly: true } });
    if (!set) return { error: 'Term set not found', status: 404 };
    if (set.source !== 'external' || !set.readOnly) return { error: 'Only imported (read-only) term sets can be re-imported', status: 409 };
    const terms = await db.term.findMany({
      where: { termSetId: set.id },
      select: { id: true, externalId: true, parentId: true, label: true, description: true, status: true, synonyms: { select: { normalizedLabel: true, kind: true } } },
    });
    return { key: set.id, termSetId: set.id, newSetName: null, terms };
  }
  const name = cleanLabel(body.newSetName);
  if (!name) return { error: 'Name the new term set (up to 120 characters)', status: 400 };
  const clash = await db.termSet.findFirst({ where: { orgId, name: { equals: name, mode: 'insensitive' } }, select: { id: true } });
  if (clash) return { error: `A term set called "${name}" already exists`, status: 409 };
  return { key: importTargetKey({ newSetName: name }), termSetId: null, newSetName: name, terms: [], normalizedName: normalizeLabel(name) };
}
