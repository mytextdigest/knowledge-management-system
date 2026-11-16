import { randomUUID } from 'node:crypto';
import { verifyImportApply } from './applyGuard.mjs';
import { buildApplyPlan, calculateHierarchy, normalizeImportedSynonyms } from './applyPlan.mjs';
import { normalizeLabel } from '../labels.mjs';
import { planSafeSynonymUpserts } from './synonymSafety.mjs';
import { parseTaxonomyCsv } from './csv.mjs';
import { parseSkosTurtle, parseSkosRdfXml } from './skos.mjs';

const parsers = { csv: parseTaxonomyCsv, skos_ttl: parseSkosTurtle, skos_rdfxml: parseSkosRdfXml };
const GUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const sameArray = (a = [], b = []) => a.length === b.length && a.every((v, i) => v === b[i]);

// Preview-token key for an import target: an existing set, or a new set by name.
export const importTargetKey = ({ termSetId, newSetName }) => termSetId || `new:${normalizeLabel(newSetName)}`;

/**
 * C-6/C-7 apply. Call inside one Prisma interactive transaction, after org
 * authorization. Creates the external read-only term set on a first import
 * (`newSetName`), or re-syncs an existing one (`termSetId`). Tags are never
 * touched: removed terms are deprecated, and existing synonyms are kept.
 * Query count doesn't grow with the taxonomy except for changed terms.
 */
export async function applyImportedTaxonomy(tx, { orgId, termSetId = null, newSetName = null, format, content, confirmationToken, actorUserId }) {
  if (!parsers[format]) throw new Error('Unsupported import format');
  const key = importTargetKey({ termSetId, newSetName });
  // Serialize imports for this target. All import writers must use this function.
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`taxonomy-import:${orgId}:${key}`}))::text AS locked`;

  let set = null;
  let terms = [];
  if (termSetId) {
    set = await tx.termSet.findFirst({ where: { id: termSetId, orgId }, select: { id: true, source: true, readOnly: true } });
    if (!set) throw new Error('Term set not found');
    if (set.source !== 'external' || !set.readOnly) throw new Error('Only external read-only sets may be imported');
    terms = await tx.term.findMany({
      where: { termSetId },
      select: { id: true, externalId: true, parentId: true, label: true, description: true, status: true, ancestorIds: true, depth: true, termStoreGuid: true, synonyms: { select: { normalizedLabel: true, kind: true } } },
    });
  }
  const verified = verifyImportApply({ termSetId: key, format, content, terms, confirmationToken });
  const parsed = parsers[format](content);
  const ordered = buildApplyPlan(parsed.concepts);

  if (!set) {
    set = await tx.termSet.create({
      data: {
        orgId, name: newSetName.trim(), source: 'external', readOnly: true,
        externalId: parsed.schemes?.[0] ?? null, importFormat: format,
        description: parsed.schemeLabel ? `Imported from ${parsed.schemeLabel}` : 'Imported taxonomy',
        createdById: actorUserId,
      },
      select: { id: true },
    });
  }

  // Ids for new terms are chosen here, so the whole hierarchy is known up front.
  const ids = new Map(terms.filter((t) => t.externalId).map((t) => [t.externalId, t.id]));
  for (const c of ordered) if (!ids.has(c.externalId)) ids.set(c.externalId, randomUUID());
  const hierarchy = calculateHierarchy(ordered, ids);
  const stored = new Map(terms.map((t) => [t.externalId, t]));

  const row = (c) => {
    const node = hierarchy.get(c.externalId);
    return {
      label: c.label, normalizedLabel: normalizeLabel(c.label), description: c.description ?? null, status: 'active',
      parentId: node.parentId, ancestorIds: node.ancestorIds, depth: node.depth,
      termStoreGuid: c.externalId.match(GUID)?.[0]?.toLowerCase() ?? null,
    };
  };
  // Parents come first in `ordered`, so one insert satisfies the parent links.
  const additions = ordered.filter((c) => !stored.has(c.externalId));
  if (additions.length) {
    await tx.term.createMany({ data: additions.map((c, i) => ({ id: ids.get(c.externalId), termSetId: set.id, externalId: c.externalId, sortOrder: i, ...row(c) })) });
  }
  let updated = 0;
  for (const c of ordered) {
    const before = stored.get(c.externalId);
    if (!before) continue;
    const after = row(c);
    const changed = before.label !== after.label || (before.description ?? null) !== after.description || before.status !== 'active'
      || (before.parentId ?? null) !== after.parentId || !sameArray(before.ancestorIds, after.ancestorIds) || before.depth !== after.depth
      || (before.termStoreGuid ?? null) !== after.termStoreGuid;
    if (!changed) continue;
    await tx.term.update({ where: { id: before.id }, data: after });
    updated++;
  }

  // Synonyms: add what's missing, keep what's there (local aliases included).
  const synonymRows = [];
  const warnings = [...(parsed.warnings || [])];
  for (const c of ordered) {
    const termId = ids.get(c.externalId);
    const { additions: missing, conflicts } = planSafeSynonymUpserts(stored.get(c.externalId)?.synonyms || [], normalizeImportedSynonyms(c));
    for (const s of missing) synonymRows.push({ ...s, termId });
    for (const s of conflicts) warnings.push(`"${c.label}": "${s.normalizedLabel}" kept as ${s.existingKind} label (file says ${s.kind})`);
  }
  if (synonymRows.length) await tx.termSynonym.createMany({ data: synonymRows, skipDuplicates: true });

  // skos:related within the set (E3.3), replaced on each import.
  const termIds = [...new Set(ids.values())];
  await tx.termRelation.deleteMany({ where: { kind: 'related', fromTermId: { in: termIds } } });
  const relations = [];
  for (const c of ordered) {
    for (const other of c.relatedExternalIds || []) {
      if (ids.has(other) && other !== c.externalId) relations.push({ fromTermId: ids.get(c.externalId), toTermId: ids.get(other), kind: 'related' });
    }
  }
  if (relations.length) await tx.termRelation.createMany({ data: relations, skipDuplicates: true });

  const importedIds = new Set(ordered.map((c) => c.externalId));
  const deprecatedIds = terms.filter((t) => !importedIds.has(t.externalId) && t.status !== 'deprecated').map((t) => t.id);
  if (deprecatedIds.length) await tx.term.updateMany({ where: { id: { in: deprecatedIds }, termSetId: set.id }, data: { status: 'deprecated' } });

  await tx.termSet.update({ where: { id: set.id }, data: { lastImportedAt: new Date(), importFormat: format, ...(parsed.schemes?.[0] ? { externalId: parsed.schemes[0] } : {}) } });
  const summary = { ...verified.summary, synonymsAdded: synonymRows.length, relations: relations.length, warnings: warnings.slice(0, 50) };
  const record = await tx.taxonomyImport.create({ data: { orgId, termSetId: set.id, format, status: 'applied', summary, createdById: actorUserId, appliedAt: new Date() } });
  return { importId: record.id, termSetId: set.id, created: !termSetId, summary, writes: { added: additions.length, updated, deprecated: deprecatedIds.length } };
}
