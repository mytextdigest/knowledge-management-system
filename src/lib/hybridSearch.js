import { orgSearch, orgKeywordSearch, orgFallbackTextSearch } from "@/lib/vectorSearch";
import { prisma } from "@/lib/prisma";
import { expandWithRelatedDocuments } from "@/lib/knowledgeContext";

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

function normalizeTokens(value) {
  return new Set(
    String(value || "")
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, " ")
      .split(/\s+/)
      .filter((token) => token.length >= 3)
  );
}

function questionsAreSimilar(a, b) {
  const left = normalizeTokens(a);
  const right = normalizeTokens(b);
  if (left.size === 0 || right.size === 0) return false;
  let overlap = 0;
  for (const token of left) if (right.has(token)) overlap += 1;
  return overlap >= 2 && overlap / Math.min(left.size, right.size) >= 0.4;
}

async function getFeedbackDocumentWeights({ orgId, question, queries }) {
  const messages = await prisma.orgMessage.findMany({
    where: {
      feedback: { in: ["up", "down"] },
      conversation: { orgId },
    },
    orderBy: { createdAt: "desc" },
    take: 120,
    select: {
      feedback: true,
      sources: true,
      createdAt: true,
      conversationId: true,
    },
  });

  if (messages.length === 0) return new Map();
  const conversationIds = [...new Set(messages.map((message) => message.conversationId))];
  const userMessages = await prisma.orgMessage.findMany({
    where: { conversationId: { in: conversationIds }, role: "user" },
    orderBy: { createdAt: "asc" },
    select: { conversationId: true, content: true, createdAt: true },
  });

  const currentQuestion = question || queries.find(Boolean) || "";
  const weights = new Map();
  for (const message of messages) {
    const preceding = userMessages
      .filter((candidate) => candidate.conversationId === message.conversationId && candidate.createdAt < message.createdAt)
      .at(-1);
    if (!preceding || !questionsAreSimilar(currentQuestion, preceding.content)) continue;

    const sources = Array.isArray(message.sources) ? message.sources : [];
    for (const source of sources) {
      const documentId = source?.documentId;
      if (!documentId) continue;
      const current = weights.get(documentId) || { up: 0, down: 0 };
      if (message.feedback === "up") current.up += 1;
      if (message.feedback === "down") current.down += 1;
      weights.set(documentId, current);
    }
  }

  const eligible = new Map();
  for (const [documentId, counts] of weights) {
    const total = counts.up + counts.down;
    if (total < 3) continue;
    eligible.set(documentId, Math.max(-0.12, Math.min(0.12, (counts.up - counts.down) * 0.03)));
  }
  return eligible;
}

function applyFeedbackWeights(rows, weights) {
  if (!weights.size) return rows;
  return rows
    .map((row) => ({
      ...row,
      feedbackBoost: weights.get(row.document_id) || 0,
      hybridScore: Number(row.hybridScore || 0) + (weights.get(row.document_id) || 0),
    }))
    .sort((a, b) => Number(b.hybridScore || 0) - Number(a.hybridScore || 0));
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
  feedbackQuestion = null,
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

  const feedbackWeights = await getFeedbackDocumentWeights({
    orgId,
    question: feedbackQuestion,
    queries: safeQueries,
  });
  ranked = applyFeedbackWeights(ranked, feedbackWeights);

  let effectiveDiversify = diversify;
  if (naturalDiversityCheck) {
    const distinctSources = new Set(ranked.slice(0, limit).map(sourceKey)).size;
    effectiveDiversify = distinctSources >= 2;
  }

  const base = effectiveDiversify ? diversifyResults(ranked, limit) : ranked.slice(0, limit);
  return expandWithRelatedDocuments({ rows: base, orgId, userId, isSuperAdmin, limit });
}
