/**
 * F7 unified retrieval entry point. D-3 intentionally preserves the Phase 1
 * retrieval algorithms and result ordering; D-4 will add event persistence.
 */
import { hybridOrgSearch } from "@/lib/hybridSearch";
import { orgSearch } from "@/lib/vectorSearch";
import { prisma } from "@/lib/prisma";

// Analytics must never prevent a permitted retrieval from returning.
function normalizeQuery(query) {
  return String(query || "").trim().replace(/\s+/g, " ").toLowerCase().slice(0, 500);
}

async function recordSearch({ kind, query, options, resultCount, latencyMs }) {
  if (!options.orgId || !options.userId || !normalizeQuery(query)) return null;
  try {
    const previous = await prisma.searchEvent.findFirst({
      where: {
        orgId: options.orgId,
        userId: options.userId,
        kind,
        createdAt: { gte: new Date(Date.now() - 60000) },
      },
      orderBy: { createdAt: "desc" },
      select: { id: true, normalizedQuery: true },
    });
    const normalizedQuery = normalizeQuery(query);
    const event = await prisma.searchEvent.create({
      data: {
        orgId: options.orgId,
        userId: options.userId,
        kind,
        query: String(query).trim().slice(0, 2000),
        normalizedQuery,
        filters: { scope: options.scope || "organization", departmentId: options.departmentId || null },
        resultCount,
        latencyMs: Math.max(0, Math.round(latencyMs)),
        previousEventId: previous && previous.normalizedQuery !== normalizedQuery ? previous.id : null,
      },
      select: { id: true },
    });
    return event.id;
  } catch (error) {
    console.warn("Search telemetry unavailable:", error?.message);
    return null;
  }
}

export async function search({ kind = "search", query, queryEmbedding, ...options }) {
  const startedAt = Date.now();
  if (kind === "repository") {
    if (!Array.isArray(queryEmbedding) || queryEmbedding.length === 0) {
      throw new Error("Repository semantic search requires a query embedding");
    }
    const results = await orgSearch(queryEmbedding, options);
    const searchEventId = await recordSearch({ kind, query, options, resultCount: results.length, latencyMs: Date.now() - startedAt });
    return { results, searchEventId };
  }

  // Do not alter query expansion, embeddings, ranking or access rules here.
  // Existing callers continue supplying the same retrieval parameters.
  const results = await hybridOrgSearch(options);
  const searchEventId = await recordSearch({ kind, query, options, resultCount: results.length, latencyMs: Date.now() - startedAt });
  return { results, searchEventId };
}
