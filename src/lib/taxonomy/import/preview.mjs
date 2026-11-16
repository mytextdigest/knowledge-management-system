import { parseTaxonomyCsv } from './csv.mjs';
import { parseSkosTurtle, parseSkosRdfXml } from './skos.mjs';
import { previewTaxonomyDiff } from './diff.mjs';

export const MAX_IMPORT_BYTES = 8 * 1024 * 1024;
const parsers = Object.freeze({ csv: parseTaxonomyCsv, skos_ttl: parseSkosTurtle, skos_rdfxml: parseSkosRdfXml });

/** Build a dry-run preview from an untrusted file and a scoped, read-only DB snapshot. */
export function buildImportPreview({ format, content, terms = [] }) {
  if (!Object.hasOwn(parsers, format)) throw new Error('Unsupported import format');
  if (typeof content !== 'string' || !content.trim()) throw new Error('Import content is required');
  if (Buffer.byteLength(content, 'utf8') > MAX_IMPORT_BYTES) throw new Error('Import exceeds 8 MiB limit');
  if (!Array.isArray(terms) || terms.length > 20000) throw new Error('Invalid stored taxonomy snapshot');
  const parsed = parsers[format](content);
  if (parsed.concepts.length > 10000) throw new Error('Import exceeds 10,000 terms');
  // Existing parentId is a database PK, not an external ID. Resolve explicitly.
  const byId = new Map(terms.map(t => [t.id, t]));
  const existing = terms.map(t => {
    if (!t.externalId) throw new Error('Cannot re-sync a term set containing terms without stable external IDs');
    if (t.parentId && !byId.has(t.parentId)) throw new Error('Stored taxonomy has a missing parent');
    const parentExternalId = t.parentId ? byId.get(t.parentId).externalId : null;
    if (t.parentId && !parentExternalId) throw new Error('Stored parent lacks a stable external ID');
    return { externalId: t.externalId, label: t.label, description: t.description,
      parentExternalId, status: t.status };
  });
  const diff = previewTaxonomyDiff(parsed, existing);
  const warnings = [...(parsed.warnings || [])];
  if (parsed.concepts.some((c) => c.externalId.startsWith('csv:path:'))) {
    warnings.unshift('This CSV has no id column, so terms are identified by their path: a renamed or moved term will be imported as a new term and the old one deprecated. Add an id column to keep tags across renames.');
  }
  return {
    format, count: parsed.concepts.length, ...diff, warnings,
    scheme: parsed.schemes?.[0] ?? null, schemeLabel: parsed.schemeLabel ?? null,
    relations: parsed.concepts.reduce((n, c) => n + (c.relatedExternalIds?.length || 0), 0),
  };
}
