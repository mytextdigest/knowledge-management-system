import { orgSearch, orgKeywordSearch, orgFallbackTextSearch } from "@/lib/vectorSearch";

function normalizeDistance(distance) {
  const value = Number(distance);
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, 1 - value);
}

function mergeResults(rows, limit = 8) {
  const merged = new Map();

  for (const row of rows) {
    const key = row.id;
    const vectorScore = row.distance !== undefined ? normalizeDistance(row.distance) : 0;
    const keywordScore = row.keyword_score !== undefined ? Number(row.keyword_score) : 0;

    const existing = merged.get(key);

    const next = {
      ...(existing || {}),
      ...row,
      vectorScore: Math.max(existing?.vectorScore || 0, vectorScore),
      keywordScore: Math.max(existing?.keywordScore || 0, keywordScore),
    };

    next.hybridScore = next.vectorScore * 0.65 + next.keywordScore * 0.35;
    merged.set(key, next);
  }

  return Array.from(merged.values())
    .sort((a, b) => Number(b.hybridScore || 0) - Number(a.hybridScore || 0))
    .slice(0, limit);
}

export async function hybridOrgSearch({
  queries,
  embeddings,
  userId,
  orgId,
  scope = "organization",
  departmentId = null,
  limit = 8,
  isSuperAdmin = false,
}) {
  const safeQueries = Array.isArray(queries) ? queries.filter(Boolean) : [];
  const safeEmbeddings = Array.isArray(embeddings) ? embeddings.filter(Boolean) : [];

  const allRows = [];

  for (const embedding of safeEmbeddings) {
    const rows = await orgSearch(embedding, {
      userId,
      orgId,
      limit,
      scope,
      departmentId,
      isSuperAdmin,
    });
    allRows.push(...rows);
  }

  for (const query of safeQueries) {
    const rows = await orgKeywordSearch(query, {
      userId,
      orgId,
      limit,
      scope,
      departmentId,
      isSuperAdmin,
    });
    allRows.push(...rows);
  }

  let merged = mergeResults(allRows, limit);

  if (merged.length === 0 && safeQueries.length > 0) {
    const fallbackRows = await orgFallbackTextSearch(safeQueries[0], {
      userId,
      orgId,
      limit,
      scope,
      departmentId,
      isSuperAdmin,
    });

    merged = mergeResults(fallbackRows, limit);
  }

  return merged;
}