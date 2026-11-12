import { normalizeLabel } from '../labels.mjs';

/** Pure, conservative diff for externally managed taxonomies. Never writes to Prisma. */
export function previewTaxonomyDiff(parsed, existing = [], options = {}) {
  if (!Array.isArray(parsed?.concepts) || !Array.isArray(existing)) throw new Error('Expected concept and existing-term arrays');
  const { allowPathDerivedIds = false } = options;
  const incoming = new Map();
  for (const item of parsed.concepts) {
    if (!item || typeof item.externalId !== 'string' || !item.externalId.trim() || typeof item.label !== 'string' || !item.label.trim()) throw new Error('Each concept requires externalId and label');
    if (!allowPathDerivedIds && item.externalId.startsWith('csv:path:')) throw new Error('Path-derived IDs cannot safely track taxonomy renames or moves');
    if (incoming.has(item.externalId)) throw new Error(`Duplicate external ID: ${item.externalId}`);
    incoming.set(item.externalId, item);
  }
  const old = new Map();
  for (const term of existing) {
    if (!term || !term.externalId) throw new Error('Existing external terms must have externalId');
    if (old.has(term.externalId)) throw new Error(`Duplicate stored external ID: ${term.externalId}`);
    old.set(term.externalId, term);
  }
  for (const item of incoming.values()) {
    if (item.parentExternalId && !incoming.has(item.parentExternalId)) throw new Error(`Missing imported parent: ${item.parentExternalId}`);
    const seen = new Set(); let current = item;
    while (current) {
      if (seen.has(current.externalId)) throw new Error(`Cycle: ${item.externalId}`);
      seen.add(current.externalId);
      current = current.parentExternalId ? incoming.get(current.parentExternalId) : null;
    }
  }
  const actions = [];
  for (const item of incoming.values()) {
    const prior = old.get(item.externalId);
    if (!prior) { actions.push({ type: 'add', externalId: item.externalId, after: item }); continue; }
    const beforeParent = prior.parentExternalId ?? null;
    const afterParent = item.parentExternalId ?? null;
    const renamed = normalizeLabel(prior.label) !== normalizeLabel(item.label);
    const moved = beforeParent !== afterParent;
    const descriptionChanged = (prior.description ?? '') !== (item.description ?? '');
    const reactivated = prior.status === 'deprecated';
    const type = moved ? 'move' : (renamed || descriptionChanged || reactivated ? 'update' : 'unchanged');
    actions.push({ type, externalId: item.externalId, renamed, moved, descriptionChanged, reactivated,
      before: { label: prior.label, parentExternalId: beforeParent, description: prior.description ?? null, status: prior.status ?? 'active' },
      after: item });
  }
  for (const term of old.values()) if (!incoming.has(term.externalId)) {
    actions.push({ type: term.status === 'deprecated' ? 'unchanged' : 'deprecate', externalId: term.externalId,
      before: { label: term.label, parentExternalId: term.parentExternalId ?? null, status: term.status ?? 'active' } });
  }
  const summary = { added: 0, updated: 0, moved: 0, deprecated: 0, unchanged: 0 };
  for (const action of actions) summary[({ add: 'added', update: 'updated', move: 'moved', deprecate: 'deprecated', unchanged: 'unchanged' })[action.type]]++;
  return { summary, actions, requiresReview: actions.some(a => a.type !== 'unchanged'), safeToApplyAutomatically: false };
}
