import { orgSearch, orgKeywordSearch, orgFallbackTextSearch } from "@/lib/vectorSearch";

function normalizeDistance(distance) {
  const value = Number(distance);
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, 1 - value);
}

function mergeRows(rows) {
  const merged = new Map();

  for (const row of rows) {
    const key = row.id;
    const vectorScore = row.distance !== undefined ? normalizeDistance(row.distance) : 0;
    const keywordScore = row.keyword_score !== undefined ? Number(row.keyword_score) : 0;
    const existing = merged.get(key);

    const next = {
      ...(existing || {}),
      ...row,
      distance:
        existing?.distance !== undefined
          ? Math.min(Number(existing.distance), Number(row.distance))
          : row.distance,
      vectorScore: Math.max(existing?.vectorScore || 0, vectorScore),
      keywordScore: Math.max(existing?.keywordScore || 0, keywordScore),
    };

    next.hybridScore = next.vectorScore * 0.65 + next.keywordScore * 0.35;
    merged.set(key, next);
  }

  return Array.from(merged.values()).sort(
    (a, b) => Number(b.hybridScore || 0) - Number(a.hybridScore || 0)
  );
}

function sourceKey(row) {
  if (row.projectId || row.project_id) return `project:${row.projectId || row.project_id}`;
  if (row.departmentId || row.department_id) {
    return `department:${row.departmentId || row.department_id}`;
  }
  return `document:${row.document_id}`;
}

/**
 * Preserve relevance while preventing a single project from consuming every
 * context slot during cross-project synthesis. This runs only after every row
 * has already passed the SQL-level organization/scope/RBAC filters.
 */
function diversifyResults(rows, limit) {
  if (rows.length <= limit) return rows;

  const selected = [];
  const selectedIds = new Set();
  const perSource = new Map();
  const firstPassCap = Math.max(1, Math.ceil(limit / 3));

  for (const row of rows) {
    const key = sourceKey(row);
    const count = perSource.get(key) || 0;
    if (count >= firstPassCap) continue;

    selected.push(row);
    selectedIds.add(row.id);
    perSource.set(key, count + 1);
    if (selected.length === limit) return selected;
  }

  for (const row of rows) {
    if (selectedIds.has(row.id)) continue;
    selected.push(row);
    if (selected.length === limit) break;
  }

  return selected;
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
  diversify = false,
}) {
  const safeQueries = Array.isArray(queries) ? queries.filter(Boolean) : [];
  const safeEmbeddings = Array.isArray(embeddings) ? embeddings.filter(Boolean) : [];
  // A small fixed buffer (not the full 3x widen) lets us detect when a
  // question is *naturally* cross-project — i.e. the top-ranked chunks
  // already span multiple projects/departments on their own merit — without
  // depending solely on the caller's keyword-based `diversify` guess, and
  // without paying the full widened-candidate-pool cost on every org-scope
  // query.
  const naturalDiversityCheck = !diversify && scope === "organization";
  const candidateLimit = diversify
    ? Math.max(limit * 3, 24)
    : naturalDiversityCheck
      ? limit + 6
      : limit;
  const allRows = [];

  for (const embedding of safeEmbeddings) {
    const rows = await orgSearch(embedding, {
      userId,
      orgId,
      limit: candidateLimit,
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
      limit: candidateLimit,
      scope,
      departmentId,
      isSuperAdmin,
    });
    allRows.push(...rows);
  }

  let ranked = mergeRows(allRows);

  if (ranked.length === 0 && safeQueries.length > 0) {
    const fallbackRows = await orgFallbackTextSearch(safeQueries[0], {
      userId,
      orgId,
      limit: candidateLimit,
      scope,
      departmentId,
      isSuperAdmin,
    });
    ranked = mergeRows(fallbackRows);
  }

  let effectiveDiversify = diversify;
  if (naturalDiversityCheck) {
    const distinctSources = new Set(ranked.slice(0, limit).map(sourceKey)).size;
    effectiveDiversify = distinctSources >= 2;
  }

  return effectiveDiversify ? diversifyResults(ranked, limit) : ranked.slice(0, limit);
}
