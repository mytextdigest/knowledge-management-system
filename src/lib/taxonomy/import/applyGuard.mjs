import { createHash, timingSafeEqual } from 'node:crypto';
import { buildImportPreview } from './preview.mjs';

const canonical = (value) => {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])]));
  return value;
};
const hash = (value) => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
const sortedTerms = terms => [...terms].map(t => ({
  id: t.id, externalId: t.externalId, parentId: t.parentId ?? null,
  label: t.label, description: t.description ?? null, status: t.status,
  synonyms: (t.synonyms || []).map(s => ({ normalizedLabel: s.normalizedLabel, kind: s.kind })).sort((a,b) => a.normalizedLabel.localeCompare(b.normalizedLabel)),
})).sort((a,b) => String(a.id).localeCompare(String(b.id)));

/** Produce a deterministic preview token, bound to the exact input and stored term snapshot. */
export function prepareImportApply({ termSetId, format, content, terms }) {
  if (typeof termSetId !== 'string' || !termSetId) throw new Error('termSetId required');
  const preview = buildImportPreview({ format, content, terms });
  const snapshotHash = hash(sortedTerms(terms));
  const inputHash = hash({ termSetId, format, content });
  const confirmationToken = hash({ snapshotHash, inputHash, summary: preview.summary, actions: preview.actions });
  return { ...preview, snapshotHash, inputHash, confirmationToken, previewOnly: true };
}

/** Recalculate against a fresh DB snapshot immediately before apply, inside a transaction. */
export function verifyImportApply({ termSetId, format, content, terms, confirmationToken }) {
  if (typeof confirmationToken !== 'string' || !/^[a-f0-9]{64}$/.test(confirmationToken)) throw new Error('Valid confirmation token required');
  const current = prepareImportApply({ termSetId, format, content, terms });
  const expected = Buffer.from(current.confirmationToken, 'hex');
  const provided = Buffer.from(confirmationToken, 'hex');
  if (!timingSafeEqual(expected, provided)) throw new Error('Import preview is stale or input changed; preview again');
  return { ...current, previewOnly: false, verified: true };
}
