// C-8: which SharePoint managed-metadata column feeds which KMS metadata field,
// and bringing synced documents' tags in as terms.
//
// The map lives in OrgSetting (not in OrgIntegration.scopeConfig, which the
// sync worker rewrites from a snapshot at the end of every run).
import { reconcileSourceDocumentTerms } from './sourceTagSync.mjs';

export const FIELD_MAP_KEY = 'taxonomy.sharepoint_field_map';
const COLUMN = /^[A-Za-z0-9_\-.]{1,255}$/;

/** { internalColumnName: metadataFieldId } for the org; {} when not set. */
export async function getFieldMap(db, orgId) {
  const row = await db.orgSetting.findUnique({ where: { orgId_key: { orgId, key: FIELD_MAP_KEY } }, select: { value: true } });
  const value = row?.value;
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

/** Validates a map against the org's fields; returns the cleaned map. */
export async function validateFieldMap(db, orgId, mapping) {
  if (!mapping || typeof mapping !== 'object' || Array.isArray(mapping)) throw new Error('Invalid column mapping');
  const entries = Object.entries(mapping).filter(([, fieldId]) => fieldId);
  if (entries.length > 50) throw new Error('Too many mapped columns');
  for (const [column, fieldId] of entries) {
    if (!COLUMN.test(column) || typeof fieldId !== 'string') throw new Error(`Invalid mapping for column ${column}`);
  }
  const ids = [...new Set(entries.map(([, id]) => id))];
  const found = await db.metadataField.count({ where: { orgId, id: { in: ids } } });
  if (found !== ids.length) throw new Error('A mapped field does not belong to this organization');
  return Object.fromEntries(entries);
}

/**
 * Reconciles up to `limit` documents that carry tags in mapped columns,
 * starting after `cursor` (document id). Each document is its own
 * transaction, so one bad document doesn't undo the others. Returns counts
 * and `nextCursor` (null when done).
 */
export async function reconcileMappedDocuments(db, { orgId, mapping, cursor = null, limit = 200 }) {
  const columns = Object.keys(mapping || {});
  const result = { processed: 0, synced: 0, review: 0, failed: 0, nextCursor: null };
  if (!columns.length) return result;
  const docs = await db.document.findMany({
    where: { orgId, deletedAt: null, sourceTags: { some: { fieldName: { in: columns } } }, ...(cursor ? { id: { gt: cursor } } : {}) },
    select: { id: true }, orderBy: { id: 'asc' }, take: limit,
  });
  for (const { id } of docs) {
    try {
      const r = await db.$transaction((tx) => reconcileSourceDocumentTerms(tx, { orgId, documentId: id, fieldBySourceName: mapping }));
      result.processed++;
      if (r.fields.some((f) => f.status === 'review')) result.review++;
      else result.synced++;
    } catch (error) {
      result.failed++;
      console.warn('C-8 tag mapping failed for document', id, error?.message);
    }
  }
  result.nextCursor = docs.length === limit ? docs.at(-1).id : null;
  return result;
}
