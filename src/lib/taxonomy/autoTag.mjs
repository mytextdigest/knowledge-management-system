// C-10: taxonomy classification; deliberately separate from legacy Category classification.
export const EMBEDDING_MODEL = 'text-embedding-3-small';
export const TAG_THRESHOLD = 0.78;
export const SHORTLIST_SIZE = 40;
export function similarity(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length || !a.length) return 0;
  let dot = 0, aa = 0, bb = 0;
  for (let i = 0; i < a.length; i++) {
    const x = Number(a[i]), y = Number(b[i]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return 0;
    dot += x * y; aa += x * x; bb += y * y;
  }
  return aa && bb ? dot / Math.sqrt(aa * bb) : 0;
}
export function termText(term) {
  return [term.label, ...(term.synonyms || []).map(s => s.label), term.description].filter(Boolean).join(' | ').slice(0, 4000);
}
export function shortlistTerms(terms, vector, limit = SHORTLIST_SIZE) {
  return terms.map(t => ({ ...t, similarity: similarity(vector, t.embedding) }))
    .filter(t => Number.isFinite(t.similarity) && t.similarity > 0)
    .sort((a, b) => b.similarity - a.similarity || a.id.localeCompare(b.id)).slice(0, limit);
}
export function decideTags(picks, candidates, fields, { threshold = TAG_THRESHOLD, sourceTagged = false } = {}) {
  const byId = new Map(candidates.map(t => [t.id, t]));
  const fieldBySet = new Map(fields.map(f => [f.termSetId, f]));
  const result = new Map();
  for (const pick of Array.isArray(picks) ? picks : []) {
    const term = byId.get(pick?.termId);
    if (!term) continue; // Never trust invented LLM IDs.
    const field = fieldBySet.get(term.termSetId);
    if (!field || field.key === 'category') continue; // Legacy category has its own bridge.
    const confidence = Number(pick.confidence);
    if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) continue;
    const status = sourceTagged || confidence < threshold ? 'suggested' : 'accepted';
    const key = `${field.id}:${term.id}`;
    if (!result.has(key) || result.get(key).confidence < confidence) result.set(key, { fieldId: field.id, termId: term.id, confidence, status });
  }
  // A single-value field must never receive two auto-accepted tags.
  for (const field of fields.filter(f => !f.multi)) {
    const values = [...result.values()].filter(t => t.fieldId === field.id).sort((a,b) => b.confidence - a.confidence);
    for (const value of values.slice(1)) value.status = 'suggested';
  }
  return [...result.values()];
}
const vectorSql = vector => `[${vector.join(',')}]`;
async function embed(openai, input) {
  const response = await openai.embeddings.create({ model: EMBEDDING_MODEL, input });
  const vector = response.data?.[0]?.embedding;
  if (!Array.isArray(vector) || vector.length !== 1536) throw new Error('Expected 1536-dimensional embedding');
  return vector;
}
// Idempotent on unchanged term text; re-imported terms are invalidated by updatedAt.
export async function ensureTermEmbeddings(prisma, openai, terms) {
  const stale = terms.filter(term => !term.embeddedAt || term.embeddedAt < term.updatedAt);
  // Batch embedding requests: ~2,600 terms require ~27 requests, not 2,600.
  for (let offset = 0; offset < stale.length; offset += 96) {
    const batch = stale.slice(offset, offset + 96);
    const response = await openai.embeddings.create({ model: EMBEDDING_MODEL, input: batch.map(termText) });
    const vectors = new Map(response.data.map(row => [row.index, row.embedding]));
    for (let i = 0; i < batch.length; i++) {
      const vector = vectors.get(i);
      if (!Array.isArray(vector) || vector.length !== 1536) throw new Error('Expected 1536-dimensional term embedding');
      const term = batch[i];
      await prisma.$executeRaw`UPDATE "Term" SET embedding_vec = ${vectorSql(vector)}::vector, embedded_at = NOW() WHERE id = ${term.id} AND updated_at = ${term.updatedAt}`;
    }
  }
}
export async function classifyTaxonomyTerms({ prisma, openai, orgId, documentId, filename, summary, text, threshold = TAG_THRESHOLD }) {
  if (!orgId) return { skipped: 'no_org' };
  if (typeof threshold !== 'number' || !Number.isFinite(threshold) || threshold < 0 || threshold > 1) throw new Error('Invalid taxonomy threshold');
  const fields = await prisma.metadataField.findMany({ where: { orgId }, select: { id: true, key: true, multi: true, termSetId: true } });
  const applicable = fields.filter(f => f.key !== 'category');
  if (!applicable.length) return { skipped: 'no_taxonomy_fields' };
  const terms = await prisma.term.findMany({ where: { termSetId: { in: applicable.map(f => f.termSetId) }, status: 'active' }, select: { id: true, label: true, description: true, termSetId: true, updatedAt: true, embeddedAt: true, synonyms: { select: { label: true } } } });
  if (!terms.length) return { skipped: 'no_active_terms' };
  await ensureTermEmbeddings(prisma, openai, terms);
  const rows = await prisma.$queryRaw`SELECT id, embedding_vec::text AS embedding FROM "Term" WHERE id = ANY(${terms.map(t => t.id)}::text[]) AND embedding_vec IS NOT NULL`;
  const vectors = new Map(rows.map(r => [r.id, JSON.parse(r.embedding)]));
  const documentVector = await embed(openai, [filename, summary, String(text || '').slice(0, 12000)].filter(Boolean).join('\n'));
  const candidates = shortlistTerms(terms.map(t => ({ ...t, embedding: vectors.get(t.id) })), documentVector);
  if (!candidates.length) return { skipped: 'no_candidate_vectors' };
  const completion = await openai.chat.completions.create({ model: 'gpt-4o-mini', response_format: { type: 'json_object' }, temperature: 0, max_tokens: 650, messages: [
    { role: 'system', content: 'Choose ONLY termId values from the supplied candidates. Return JSON {"tags":[{"termId":"...","confidence":0.0}]}. If no match, return empty tags. Do not invent terms.' },
    { role: 'user', content: JSON.stringify({ filename, summary: String(summary || '').slice(0, 3000), sample: String(text || '').slice(0, 9000), candidates: candidates.map(({ id, label, description, synonyms }) => ({ termId: id, label, description, synonyms: synonyms.map(s => s.label) })) }) },
  ] });
  let parsed;
  try { parsed = JSON.parse(completion.choices?.[0]?.message?.content || '{}'); } catch { parsed = {}; }
  const tags = decideTags(parsed.tags, candidates, applicable, { threshold });
  let suggested = 0;
  await prisma.$transaction(async tx => {
    // Serialize classifier and reviewer writes for the same document.
    await tx.$queryRaw`SELECT id FROM "Document" WHERE id = ${documentId} FOR UPDATE`;
    const existing = await tx.documentTerm.findMany({ where: { documentId }, select: { id: true, fieldId: true, termId: true, source: true, status: true } });
    const protectedFields = new Set(existing.filter(t => t.source === 'manual' || t.source === 'source_system').map(t => t.fieldId));
    const occupiedSingleFields = new Set(existing.filter(t => t.status === 'accepted').map(t => t.fieldId));
    await tx.documentTerm.deleteMany({ where: { documentId, source: 'auto', status: 'suggested', fieldId: { in: applicable.map(f => f.id) } } });
    for (const tag of tags) {
      const field = applicable.find(f => f.id === tag.fieldId);
      const previous = existing.find(t => t.fieldId === tag.fieldId && t.termId === tag.termId);
      if (previous && !(previous.source === 'auto' && previous.status === 'suggested')) continue;
      const status = protectedFields.has(tag.fieldId) || (field && !field.multi && occupiedSingleFields.has(tag.fieldId)) ? 'suggested' : tag.status;
      if (status === 'suggested') suggested++;
      if (status === 'accepted' && field && !field.multi) occupiedSingleFields.add(tag.fieldId);
      await tx.documentTerm.create({ data: { documentId, fieldId: tag.fieldId, termId: tag.termId, confidence: tag.confidence, status, source: 'auto' } });
    }
  });
  return { candidates: candidates.length, tags: tags.length, suggested };
}
