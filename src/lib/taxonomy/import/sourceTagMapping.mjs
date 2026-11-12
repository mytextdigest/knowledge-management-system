import { normalizeLabel } from '../labels.mjs';
const guid = value => typeof value === 'string' ? value.trim().toLowerCase() : '';
const key = value => normalizeLabel(value);
/**
 * Pure, conservative matching. Never guess between ambiguous candidates.
 * Full-path fallback is permitted only when a complete source label path is provided.
 * A leaf label alone matches only if unique within the eligible term set.
 */
export function planSourceTagMappings({ tags = [], terms = [], termSetGuid = null }) {
  const eligible = terms.filter(t => t.status === 'active');
  const byId = new Map(eligible.map(t => [t.id, t]));
  const pathCache = new Map();
  function pathOf(t, seen = new Set()) {
    if (pathCache.has(t.id)) return pathCache.get(t.id);
    if (seen.has(t.id)) return null;
    seen.add(t.id);
    const parent = t.parentId ? byId.get(t.parentId) : null;
    if (t.parentId && !parent) return null;
    const path = parent ? pathOf(parent, seen) : '';
    if (path === null) return null;
    const result = path ? `${path} > ${key(t.label)}` : key(t.label);
    pathCache.set(t.id, result);
    return result;
  }
  const mapped = [], unmatched = [], ambiguous = [];
  for (const tag of tags) {
    if (termSetGuid && tag.termSetGuid && guid(tag.termSetGuid) !== guid(termSetGuid)) {
      unmatched.push({ tag, reason: 'different-term-set' }); continue;
    }
    const byGuid = eligible.filter(t => guid(t.termStoreGuid) && guid(t.termStoreGuid) === guid(tag.termGuid));
    const sourceLabel = key(tag.label);
    const candidates = byGuid.length ? byGuid : eligible.filter(t => {
      if (sourceLabel.includes('>')) return pathOf(t) === sourceLabel.split('>').map(key).join(' > ');
      return key(t.label) === sourceLabel;
    });
    if (candidates.length === 1) mapped.push({ tag, termId: candidates[0].id, method: byGuid.length ? 'guid' : 'label' });
    else if (candidates.length > 1) ambiguous.push({ tag, candidateIds: candidates.map(t => t.id) });
    else unmatched.push({ tag, reason: 'no-match' });
  }
  return { mapped, unmatched, ambiguous };
}
