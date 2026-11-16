import { normalizeLabel, cleanLabel } from '../labels.mjs';

/** Deterministic parent-first plan. Never mutates the incoming records. */
export function buildApplyPlan(concepts) {
  if (!Array.isArray(concepts) || concepts.length > 10000) throw new Error('Invalid concept count');
  const byId = new Map();
  for (const c of concepts) {
    if (typeof c?.externalId !== 'string' || !c.externalId.trim()) throw new Error('Stable external IDs required');
    const label = cleanLabel(c.label);
    if (!label) throw new Error(`Term label missing or longer than 120 characters: ${c.externalId}`);
    if (byId.has(c.externalId)) throw new Error(`Duplicate external ID: ${c.externalId}`);
    // Descriptions are kept up to 1,000 characters (Term.description limit in the editor).
    const description = c.description == null ? null : String(c.description).slice(0, 1000);
    byId.set(c.externalId, { ...c, label, description });
  }
  const ordered = [], active = new Set(), done = new Set();
  function visit(id) {
    if (done.has(id)) return;
    if (active.has(id)) throw new Error(`Cycle at ${id}`);
    const c = byId.get(id);
    if (!c) throw new Error(`Missing parent: ${id}`);
    active.add(id);
    if (c.parentExternalId) visit(c.parentExternalId);
    active.delete(id); done.add(id); ordered.push(c);
  }
  for (const id of byId.keys()) visit(id);
  const siblings = new Set();
  for (const c of ordered) {
    const key = JSON.stringify([c.parentExternalId || null, normalizeLabel(c.label)]);
    if (siblings.has(key)) throw new Error(`Duplicate sibling label: ${c.label}`);
    siblings.add(key);
  }
  return ordered;
}

/** Recalculate ancestorIds and depth for every imported term after moves. */
export function calculateHierarchy(concepts, termIds) {
  const ordered = buildApplyPlan(concepts);
  const tree = new Map();
  for (const c of ordered) {
    const id = termIds.get(c.externalId);
    if (!id) throw new Error(`Missing persisted term ID: ${c.externalId}`);
    const parent = c.parentExternalId ? tree.get(c.parentExternalId) : null;
    if (c.parentExternalId && !parent) throw new Error('Missing persisted parent');
    const ancestorIds = parent ? [...parent.ancestorIds, parent.id] : [];
    tree.set(c.externalId, { id, parentId: parent?.id ?? null, ancestorIds, depth: ancestorIds.length });
  }
  return tree;
}

export function normalizeImportedSynonyms(c) {
  const result = new Map();
  for (const [kind, values] of [['alt', c.synonyms || []], ['hidden', c.hiddenLabels || []]]) {
    if (!Array.isArray(values)) throw new Error('Invalid synonyms');
    // Labels too long for a synonym (over 120 characters) are skipped.
    for (const raw of values.slice(0, 100)) {
      const label = cleanLabel(raw);
      if (!label) continue;
      const normalizedLabel = normalizeLabel(label);
      if (normalizedLabel !== normalizeLabel(c.label) && !result.has(normalizedLabel)) result.set(normalizedLabel, { label, normalizedLabel, kind });
    }
  }
  return [...result.values()];
}
