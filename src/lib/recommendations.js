import OpenAI from "openai";
import { prisma } from "@/lib/prisma";
import { getRecentMemory } from "@/lib/orgMemberMemory";
import { hybridOrgSearch } from "@/lib/hybridSearch";
import { expandWithRelatedDocuments } from "@/lib/knowledgeContext";
import { getOrgOpenAIKey } from "@/utils/key_helper";
import { accumulateFeedbackWeight, scoreRecommendation } from "@/lib/recommendationRankingPolicy.mjs";

const DEFAULT_LIMIT = 6;
const MAX_LIMIT = 12;
const MEMORY_LIMIT = 5;
const RECENT_INTERACTION_LIMIT = 4;

function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function unique(values) {
  return [...new Set(values.map(cleanText).filter(Boolean))];
}

function recommendationReason(row, topics, requestedQuery) {
  if (row.relationshipDerived) return "Related to a document you recently viewed or worked with.";
  if (requestedQuery) return `Related to “${requestedQuery}” and your recent work.`;
  if (topics.length > 0) return `Related to your recent work on ${topics.slice(0, 2).join(" and ")}.`;
  if (row.department_name) return `Relevant content from ${row.department_name}.`;
  return "Relevant to your recent organizational work.";
}

function collapseByDocument(rows, { limit, topics, requestedQuery, excludeProjectId, feedbackWeights = new Map() }) {
  const documents = new Map();

  for (const row of rows) {
    if (!row.document_id) continue;
    if (excludeProjectId && row.projectId === excludeProjectId) continue;

    const feedbackBoost = feedbackWeights.get(row.document_id) || 0;
    const score = scoreRecommendation(row.hybridScore || row.relationship_score || 0, feedbackBoost);
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
      feedbackBoost,
      relationshipDerived: Boolean(row.relationshipDerived),
      reason: recommendationReason(row, topics, requestedQuery),
    });
  }

  return [...documents.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

function sourceDocumentIds(sources) {
  if (!Array.isArray(sources)) return [];
  return [...new Set(sources.map((source) => source?.documentId || source?.document_id).filter(Boolean))];
}

async function getUserFeedbackWeights(orgId, userId) {
  const messages = await prisma.orgMessage.findMany({
    where: {
      role: "assistant",
      feedback: { in: ["up", "down", "helpful", "not_helpful"] },
      conversation: { orgId, userId },
    },
    orderBy: { createdAt: "desc" },
    take: 150,
    select: { feedback: true, sources: true },
  });

  const weights = new Map();
  for (const message of messages) {
    for (const documentId of sourceDocumentIds(message.sources)) {
      weights.set(documentId, accumulateFeedbackWeight(weights.get(documentId) || 0, message.feedback));
    }
  }
  return weights;
}

async function relatedInteractionCandidates({ orgId, userId, isSuperAdmin }) {
  const recent = await prisma.documentInteraction.findMany({
    where: { orgId, userId, type: { in: ["view", "download"] } },
    orderBy: { createdAt: "desc" },
    take: RECENT_INTERACTION_LIMIT,
    select: { documentId: true },
  });
  const seedIds = [...new Set(recent.map((item) => item.documentId))];
  if (!seedIds.length) return [];
  const expanded = await expandWithRelatedDocuments({
    rows: seedIds.map((documentId) => ({ document_id: documentId, hybridScore: 0 })),
    orgId,
    userId,
    isSuperAdmin,
    limit: Math.max(8, seedIds.length + 6),
  });
  return expanded.filter((row) => row.relationshipDerived);
}

export async function getDepartmentRecommendations({ orgId, departmentId, limit = DEFAULT_LIMIT }) {
  const safeLimit = Math.min(Math.max(Number(limit) || DEFAULT_LIMIT, 1), MAX_LIMIT);
  const since = new Date(Date.now() - 30 * 86400000);
  const rows = await prisma.$queryRaw`
    SELECT d.id AS "documentId", d.filename, d.category,
           COALESCE(d."departmentId", p."departmentId") AS "departmentId",
           d."projectId",
           COUNT(di.id)::int AS "interactionCount",
           COUNT(DISTINCT di."userId")::int AS "uniqueUsers"
    FROM "DocumentInteraction" di
    JOIN "Document" d ON d.id = di."documentId"
    LEFT JOIN "Project" p ON p.id = d."projectId"
    WHERE di."orgId" = ${orgId}
      AND COALESCE(d."departmentId", p."departmentId") = ${departmentId}
      AND di.type IN ('view', 'download')
      AND di."created_at" >= ${since}
      AND d.lifecycle = 'published'
      AND (
        d.scope = 'repository'
        OR (d."projectId" IS NOT NULL AND p.scope = 'org' AND p."orgId" = ${orgId})
      )
    GROUP BY d.id, d.filename, d.category, COALESCE(d."departmentId", p."departmentId"), d."projectId"
    ORDER BY "uniqueUsers" DESC, "interactionCount" DESC
    LIMIT ${safeLimit}
  `;
  return {
    mode: "department",
    topics: [],
    recommendations: rows.map((row) => ({
      documentId: row.documentId,
      filename: row.filename || "Untitled document",
      category: row.category || null,
      departmentId: row.departmentId,
      projectId: row.projectId,
      score: Number(row.uniqueUsers || 0) + Number(row.interactionCount || 0) * 0.1,
      reason: `Trending in your department · ${row.uniqueUsers} people engaged recently.`,
    })),
  };
}

export async function recordRecommendationImpressions({ orgId, userId, recommendations }) {
  const ids = [...new Set((recommendations || []).map((item) => item.documentId).filter(Boolean))];
  if (!ids.length) return;
  await prisma.documentInteraction.createMany({
    data: ids.map((documentId) => ({ documentId, userId, orgId, type: "recommendation_impression" })),
  });
}

/**
 * Shared implementation for predictive and proactive recommendations.
 * Base candidates stay RBAC-scoped through hybridOrgSearch; relationship
 * candidates use the Rank 8 graph expansion path with the same SQL access rule.
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

  const [feedbackWeights, relationshipRows] = await Promise.all([
    getUserFeedbackWeights(orgId, userId),
    relatedInteractionCandidates({ orgId, userId, isSuperAdmin }),
  ]);

  let rows = [];
  if (seedQueries.length > 0) {
    const apiKey = await getOrgOpenAIKey(orgId);
    if (!apiKey) throw new Error("ORG_OPENAI_KEY_MISSING");

    const openai = new OpenAI({ apiKey });
    const embeddingResponse = await openai.embeddings.create({ model: "text-embedding-3-small", input: seedQueries });
    const embeddings = embeddingResponse.data.map((item) => item.embedding);
    rows = await hybridOrgSearch({
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
  }

  rows = [...rows, ...relationshipRows];
  const recommendations = collapseByDocument(rows, {
    limit: safeLimit,
    topics,
    requestedQuery,
    excludeProjectId,
    feedbackWeights,
  });

  return {
    mode: requestedQuery ? "predictive" : "proactive",
    topics,
    recommendations,
  };
}
