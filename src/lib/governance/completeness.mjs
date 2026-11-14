// EKP B-13 / E21: pure, deterministic publishing completeness evaluator.
// Missing requirements are returned as field identifiers; never expose sensitive values.
export const METADATA_FIELDS = Object.freeze([
  'ownerId', 'category', 'departmentId', 'summary', 'approvedSummary',
  'filename', 'content', 'stewards', 'description',
]);
const supported = new Set(METADATA_FIELDS);
export function validMetadataRules(value) {
  return Array.isArray(value) && value.length <= 100 && value.every(rule =>
    rule && typeof rule === 'object' && !Array.isArray(rule) &&
    supported.has(rule.field) &&
    ['departmentIds', 'categories'].every(k =>
      rule[k] === undefined ||
      (Array.isArray(rule[k]) && rule[k].length <= 100 &&
       rule[k].every(v => typeof v === 'string' && v.length > 0 && v.length <= 200))
    )
  );
}
const present = v => typeof v === 'string' ? v.trim().length > 0 : v !== null && v !== undefined;
export function evaluateCompleteness(doc, rules = [], options = {}) {
  const active = rules.filter(rule =>
    (!rule.departmentIds?.length || rule.departmentIds.includes(doc.departmentId)) &&
    (!rule.categories?.length || rule.categories.includes(doc.category))
  );
  const fields = [...new Set(active.map(r => r.field))];
  if (options.requireSummaryApproval) fields.push('approvedSummary');
  const required = [...new Set(fields)];
  const missing = required.filter(field => {
    if (field === 'approvedSummary') return options.summaryStatus !== 'approved';
    if (field === 'stewards') return !doc.stewards?.length;
    if (field === 'description') return !present(doc.summary);
    return !present(doc[field]);
  });
  return { complete: missing.length === 0, completed: required.length - missing.length,
    total: required.length, missing, required };
}
