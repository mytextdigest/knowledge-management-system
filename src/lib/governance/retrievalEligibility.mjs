/** Shared final eligibility guard for current-knowledge retrieval.
 * Called AFTER related-document expansion to prevent relationship-derived leaks.
 * Does not grant access: upstream retrieval must still enforce RBAC.
 */
export function filterCurrentKnowledge(rows, documents) {
  const byId = new Map(documents.map((doc) => [doc.id, doc]));
  return rows.filter((row) => {
    const doc = byId.get(row.document_id);
    return Boolean(doc && !doc.deletedAt && !doc.supersededById && doc.lifecycle !== 'retired');
  }).map((row) => ({
    ...row,
    mayBeOutdated: byId.get(row.document_id).lifecycleSuggestion === 'archived',
  }));
}
