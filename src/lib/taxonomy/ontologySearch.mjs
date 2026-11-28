// C-11: query ontology hints. Never retrieves documents directly: caller's F1-scoped
// SQL retrieval must establish the candidate set before tag-based reranking.
export function normalizePhrase(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
}
export function matchingTerms(query, terms) {
  const padded = ` ${normalizePhrase(query)} `;
  return terms.filter(t => [t.label, ...(t.synonyms || []).map(s => s.label)]
    .some(label => { const phrase = normalizePhrase(label); return phrase.length >= 3 && padded.includes(` ${phrase} `); }));
}
export function expandQueryWithTerms(query, terms, { maxTerms = 12, maxLength = 500 } = {}) {
  const matches = matchingTerms(query, terms);
  const ids = new Set(matches.map(t => t.id));
  const expansions = [];
  for (const term of terms) {
    if (ids.has(term.id) || (term.ancestorIds || []).some(id => ids.has(id))) {
      expansions.push(term.label, ...(term.synonyms || []).map(s => s.label));
    }
  }
  const used = new Set([normalizePhrase(query)]);
  const unique = [];
  for (const value of expansions) {
    const normalized = normalizePhrase(value);
    if (!normalized || used.has(normalized)) continue;
    used.add(normalized); unique.push(value);
    if (unique.length >= maxTerms) break;
  }
  return { matches, expanded: [query, ...unique].join(' ').slice(0, maxLength) };
}
export function ontologyBoosts(matches, terms) {
  const ids = new Set(matches.map(t => t.id));
  const related = new Set();
  for (const term of terms) {
    if (ids.has(term.id)) {
      for (const id of term.ancestorIds || []) related.add(id);
      for (const relation of term.relationsFrom || []) related.add(relation.toTermId);
      for (const relation of term.relationsTo || []) related.add(relation.fromTermId);
    }
    if ((term.ancestorIds || []).some(id => ids.has(id))) related.add(term.id);
  }
  const weights = new Map();
  for (const id of related) weights.set(id, 0.06);
  for (const id of ids) weights.set(id, 0.12);
  return weights;
}
export function rerankTaggedRows(rows, tags, weights) {
  const byDocument = new Map();
  for (const tag of tags) {
    if (tag.status !== 'accepted') continue;
    const weight = weights.get(tag.termId) || 0;
    if (weight) byDocument.set(tag.documentId, Math.max(byDocument.get(tag.documentId) || 0, weight));
  }
  return rows.map(row => ({ ...row, ontologyBoost: byDocument.get(row.document_id) || 0,
    hybridScore: Number(row.hybridScore || 0) + (byDocument.get(row.document_id) || 0) }))
    .sort((a, b) => b.hybridScore - a.hybridScore);
}
const ontologyCache = new Map();
const ONTOLOGY_TTL_MS = 60_000;
export function invalidateOntologyCache(orgId) {
  if (orgId) ontologyCache.delete(orgId);
  else ontologyCache.clear();
}
export async function ontologyContext(prisma, orgId, queries) {
  if (!orgId || !queries.length) return null;
  const cached = ontologyCache.get(orgId);
  const terms = cached && cached.expires > Date.now() ? cached.terms : await prisma.term.findMany({ where: { termSet: { orgId }, status: 'active' }, select: {
    id: true, label: true, ancestorIds: true, synonyms: { select: { label: true } },
    relationsFrom: { select: { toTermId: true } }, relationsTo: { select: { fromTermId: true } },
  } });
  if (!cached || cached.expires <= Date.now()) {
    if (ontologyCache.size >= 100) ontologyCache.delete(ontologyCache.keys().next().value);
    ontologyCache.set(orgId, { terms, expires: Date.now() + ONTOLOGY_TTL_MS });
  }
  const matches = matchingTerms(queries.join(' '), terms);
  if (!matches.length) return null;
  return { terms, matches, weights: ontologyBoosts(matches, terms),
    expandedQueries: queries.map(q => expandQueryWithTerms(q, terms).expanded) };
}

// Tag-only matches: return chunks from matching documents even when the query
// words are absent from title/body. Uses the SAME F1 SQL predicate and scope
// filter as vectorSearch.orgKeywordSearch; never fetches unrestricted IDs.
export async function orgTaggedChunkSearch({ prisma, Prisma, searchAccessSql, scopeSql, termIds, userId, orgId, scope, departmentId, isSuperAdmin, limit, eligibleDocumentIds = null }) {
  if (!termIds.length) return [];
  const scopeFilter = scopeSql({ scope, departmentId, userId });
  return prisma.$queryRaw`
    SELECT DISTINCT ON (d.id) c.id, c.text, c.summary, c.chunk_index, c.document_id, c.metadata,
      d.filename, d.file_path AS "filePath", d.external_url AS "externalUrl", d.source_provider AS "sourceProvider", d.content_type AS "contentType", d."orgId", d."departmentId", d."projectId", d.scope, d.category,
      dept.name AS department_name, proj.name AS project_name,
      1::float AS distance, 0.7::float AS keyword_score
    FROM "DocumentTerm" dt
    JOIN "Document" d ON d.id = dt.document_id
    JOIN "Chunk" c ON c.document_id = d.id
    LEFT JOIN "Department" dept ON dept.id = d."departmentId"
    LEFT JOIN "Project" proj ON proj.id = d."projectId"
    LEFT JOIN "DepartmentMember" dm ON d."departmentId" = dm."departmentId" AND dm."userId" = ${userId}
    WHERE dt.term_id IN (${Prisma.join(termIds)}) AND dt.status = 'accepted'
      AND d."orgId" = ${orgId} ${scopeFilter}
      AND ${searchAccessSql({ userId, orgId, isSuperAdmin })}
    ${eligibleDocumentIds === null ? Prisma.empty : Prisma.sql`AND d.id = ANY(${eligibleDocumentIds}::text[])`}
    ORDER BY d.id, c.chunk_index ASC
    LIMIT ${Math.max(1, Math.min(100, limit))}
  `;
}
