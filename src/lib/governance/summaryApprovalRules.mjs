// Per-department/category rules. Boolean settings remain backwards compatible.
export function validSummaryApprovalRules(value) {
  if (typeof value === 'boolean') return true;
  return Array.isArray(value) && value.length <= 100 && value.every(rule =>
    rule && typeof rule === 'object' && !Array.isArray(rule) &&
    typeof rule.required === 'boolean' &&
    ['departmentIds', 'categories'].every(key => rule[key] === undefined ||
      (Array.isArray(rule[key]) && rule[key].length <= 100 &&
       rule[key].every(v => typeof v === 'string' && v.length > 0 && v.length <= 200))));
}
export function requiresSummaryApproval(setting, doc) {
  if (typeof setting === 'boolean') return setting;
  if (!validSummaryApprovalRules(setting)) throw new Error('Invalid summary approval rules');
  // Explicit scoped rules take precedence over unscoped fallback rules.
  const matches = setting.filter(rule =>
    (!rule.departmentIds?.length || rule.departmentIds.includes(doc.departmentId)) &&
    (!rule.categories?.length || rule.categories.includes(doc.category)));
  if (!matches.length) return false;
  const specificity = rule => Number(!!rule.departmentIds?.length) + Number(!!rule.categories?.length);
  const highest = Math.max(...matches.map(specificity));
  // At equal specificity, a stricter approval rule wins.
  return matches.filter(rule => specificity(rule) === highest).some(rule => rule.required);
}
