import OpenAI from "openai";
import { getRecentMemory } from "@/lib/orgMemberMemory";
import { hybridOrgSearch } from "@/lib/hybridSearch";
import { getOrgOpenAIKey } from "@/utils/key_helper";

const DEFAULT_LIMIT = 6;
const MAX_LIMIT = 12;
const MEMORY_LIMIT = 5;

function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function unique(values) {
  return [...new Set(values.map(cleanText).filter(Boolean))];
}

function recommendationReason(row, topics, requestedQuery) {
  if (requestedQuery) return `Related to “${requestedQuery}” and your recent work.`;
  if (topics.length > 0) return `Related to your recent work on ${topics.slice(0, 2).join(" and ")}.`;
  if (row.department_name) return `Relevant content from ${row.department_name}.`;
  return "Relevant to your recent organizational work.";
}

function collapseByDocument(rows, { limit, topics, requestedQuery, excludeProjectId }) {
  const documents = new Map();

  for (const row of rows) {
    if (!row.document_id) continue;
    if (excludeProjectId && row.projectId === excludeProjectId) continue;

    const score = Number(row.hybridScore || 0);
    const existing = documents.get(row.document_id);
    if (existing && existing.score >= score) continue;

    documents.set(row.document_id, {
      documentId: row.document_id,
      filename: row.filename || "Untitled document",
      excerpt: cleanText(row.summary || row.text).slice(0, 240),
      category: row.category || null,
      departmentId: row.departmentId || null,
      departmentName: row.department_name || null,
      projectId: row.projectId || null,
      projectName: row.project_name || null,
      scope: row.scope || null,
      score,
      reason: recommendationReason(row, topics, requestedQuery),
    });
  }

  return [...documents.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/**
 * Shared implementation for both predictive (query supplied) and proactive
 * (memory-only) recommendations. All document candidates come from
 * hybridOrgSearch, which applies organization, scope, department, and user
 * access checks in SQL before ranking.
 */
export async function getRecommendations({
  orgId,
  userId,
  isSuperAdmin = false,
  query = "",
  departmentId = null,
  excludeProjectId = null,
  limit = DEFAULT_LIMIT,
}) {
  const safeLimit = Math.min(Math.max(Number(limit) || DEFAULT_LIMIT, 1), MAX_LIMIT);
  const requestedQuery = cleanText(query);
  const memory = await getRecentMemory(orgId, userId, MEMORY_LIMIT);
  const topics = unique(memory.map((item) => item.topic));
  const seedQueries = unique([requestedQuery, ...topics]);

  // Proactive recommendations intentionally remain quiet until the user has
  // recent organizational memory. Predictive requests can still run from the
  // explicit query alone.
  if (seedQueries.length === 0) {
    return { mode: requestedQuery ? "predictive" : "proactive", topics, recommendations: [] };
  }

  const apiKey = await getOrgOpenAIKey(orgId);
  if (!apiKey) throw new Error("ORG_OPENAI_KEY_MISSING");

  const openai = new OpenAI({ apiKey });
  const embeddingResponse = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: seedQueries,
  });

  const embeddings = embeddingResponse.data.map((item) => item.embedding);
  const rows = await hybridOrgSearch({
    queries: seedQueries,
    embeddings,
    userId,
    orgId,
    scope: departmentId ? "department" : "organization",
    departmentId,
    limit: Math.max(safeLimit * 4, 20),
    isSuperAdmin,
    diversify: !departmentId,
  });

  return {
    mode: requestedQuery ? "predictive" : "proactive",
    topics,
    recommendations: collapseByDocument(rows, {
      limit: safeLimit,
      topics,
      requestedQuery,
      excludeProjectId,
    }),
  };
}
