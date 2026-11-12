import { planSourceTagMappings } from './sourceTagMapping.mjs';

/**
 * Reconcile one document's source-system classifications. Invoke AFTER raw
 * DocumentSourceTag rows have been stored, inside a caller-controlled transaction.
 * Does not modify raw tags or manual/auto/import classifications.
 *
 * Field mapping must be supplied explicitly (SharePoint internal column name ->
 * MetadataField.id). Never infer a field from a label or from an unrelated org.
 * No deletions occur if a tag is ambiguous/unmatched: those rows require review.
 */
export async function reconcileSourceDocumentTerms(tx, { orgId, documentId, fieldBySourceName }) {
  if (!orgId || !documentId || !fieldBySourceName || typeof fieldBySourceName !== 'object') throw new Error('orgId, documentId and explicit field mapping required');
  const doc = await tx.document.findFirst({ where: { id: documentId, orgId }, select: { id: true } });
  if (!doc) throw new Error('Document does not belong to organization');
  const tags = await tx.documentSourceTag.findMany({ where: { documentId, sourceSystem: 'sharepoint' } });
  const fields = await tx.metadataField.findMany({ where: { orgId, id: { in: [...new Set(Object.values(fieldBySourceName))] } }, select: { id: true, termSetId: true, multi: true } });
  const fieldMap = new Map(fields.map(f => [f.id, f]));
  const grouped = new Map();
  for (const tag of tags) {
    const fieldId = fieldBySourceName[tag.fieldName];
    if (!fieldId) continue;
    const field = fieldMap.get(fieldId);
    if (!field) throw new Error(`Invalid field mapping for ${tag.fieldName}`);
    if (!grouped.has(fieldId)) grouped.set(fieldId, []);
    grouped.get(fieldId).push(tag);
  }
  const results = [];
  for (const [fieldId, sourceTags] of grouped) {
    const field = fieldMap.get(fieldId);
    const set = await tx.termSet.findFirst({ where: { id: field.termSetId, orgId }, select: { id: true, externalId: true } });
    if (!set) throw new Error('Mapped term set not in organization');
    const terms = await tx.term.findMany({ where: { termSetId: set.id }, select: { id: true, parentId: true, label: true, status: true, termStoreGuid: true } });
    const plan = planSourceTagMappings({ tags: sourceTags, terms, termSetGuid: set.externalId });
    const uniqueIds = [...new Set(plan.mapped.map(m => m.termId))];
    if (!field.multi && uniqueIds.length > 1) {
      results.push({ fieldId, status: 'review', reason: 'single-value-conflict', mapped: 0 });
      continue;
    }
    // Ambiguous or unmatched tags prevent destructive reconciliation for this field.
    if (plan.unmatched.length || plan.ambiguous.length) {
      results.push({ fieldId, status: 'review', reason: 'unresolved-tags', mapped: plan.mapped.length, unmatched: plan.unmatched.length, ambiguous: plan.ambiguous.length });
      continue;
    }
    const existing = await tx.documentTerm.findMany({ where: { documentId, fieldId }, select: { id: true, termId: true, source: true } });
    const protectedIds = new Set(existing.filter(r => r.source !== 'source_system').map(r => r.termId));
    const keep = new Set(uniqueIds);
    const stale = existing.filter(r => r.source === 'source_system' && !keep.has(r.termId)).map(r => r.id);
    if (stale.length) await tx.documentTerm.deleteMany({ where: { id: { in: stale }, documentId, fieldId, source: 'source_system' } });
    const present = new Set(existing.filter(r => !stale.includes(r.id)).map(r => r.termId));
    for (const termId of uniqueIds) {
      if (present.has(termId) || protectedIds.has(termId)) continue;
      await tx.documentTerm.create({ data: { documentId, fieldId, termId, source: 'source_system', status: 'accepted' } });
    }
    results.push({ fieldId, status: 'synced', mapped: uniqueIds.length, removed: stale.length });
  }
  return { documentId, fields: results, ignoredSourceColumns: tags.filter(t => !fieldBySourceName[t.fieldName]).length };
}
