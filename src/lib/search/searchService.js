/**
 * F7 unified retrieval entry point. D-3 intentionally preserves the Phase 1
 * retrieval algorithms and result ordering. D-4 logs one SearchEvent per
 * user search (never failing the search itself).
 */
import { hybridOrgSearch } from "@/lib/hybridSearch";
import { orgSearch } from "@/lib/vectorSearch";
import { randomUUID } from "node:crypto";
import { after } from "next/server";
import { prisma } from "@/lib/prisma";

// Analytics must never prevent a permitted retrieval from returning.
function normalizeQuery(query) {
  return String(query || "").trim().replace(/\s+/g, " ").toLowerCase().slice(0, 500);
}

// Only user-typed searches are analytics events (WS-D DS-1). Recommendation
// seed queries are automatic and would skew volume and top queries.
const LOGGED_KINDS = new Set(["search", "repository", "chat"]);

// The searcher's org role and primary department at search time (E29.3):
// the department they last worked in if they still belong to it, otherwise
// their oldest department membership in this org.
async function searcherContext(orgId, userId) {
  const [member, departments] = await Promise.all([
    prisma.organizationMember.findUnique({
      where: { orgId_userId: { orgId, userId } },
      select: { role: true, lastDepartmentId: true },
    }),
    prisma.departmentMember.findMany({
      where: { userId, department: { orgId } },
      orderBy: { createdAt: "asc" },
      select: { departmentId: true },
    }),
  ]);
  const ids = departments.map((d) => d.departmentId);
  const departmentId = member?.lastDepartmentId && ids.includes(member.lastDepartmentId)
    ? member.lastDepartmentId
    : ids[0] ?? null;
  return { role: member?.role ?? null, departmentId };
}

// Writes that are still in flight, so a later update (chat time-to-answer)
// can wait for the insert instead of racing it.
const pendingEvents = new Map();

// Run telemetry after the response where the platform supports it (Next.js
// `after`); outside a request (scripts, worker) just let it run.
function runInBackground(task) {
  try {
    after(task);
  } catch {
    // Not inside a request scope.
  }
}

async function insertSearchEvent(id, { kind, query, options, resultCount, latencyMs }) {
  try {
    const [previous, searcher] = await Promise.all([
      prisma.searchEvent.findFirst({
        where: {
          orgId: options.orgId,
          userId: options.userId,
          kind,
          createdAt: { gte: new Date(Date.now() - 60000) },
        },
        orderBy: { createdAt: "desc" },
        select: { id: true, normalizedQuery: true },
      }),
      searcherContext(options.orgId, options.userId),
    ]);
    const normalizedQuery = normalizeQuery(query);
    await prisma.searchEvent.create({
      data: {
        id,
        orgId: options.orgId,
        userId: options.userId,
        kind,
        query: String(query).trim().slice(0, 2000),
        normalizedQuery,
        filters: { scope: options.scope || "organization", departmentId: options.departmentId || null, ...(options.sourceProvider ? { sourceSystem: options.sourceProvider } : {}) },
        resultCount,
        latencyMs: Math.max(0, Math.round(latencyMs)),
        departmentId: searcher.departmentId,
        role: searcher.role,
        previousEventId: previous && previous.normalizedQuery !== normalizedQuery ? previous.id : null,
      },
      select: { id: true },
    });
    return true;
  } catch (error) {
    console.warn("Search telemetry unavailable:", error?.message);
    return false;
  }
}

// Fire-and-forget (NFR-4): the id is generated here and returned at once, so
// the search never waits for the analytics lookups and insert.
function recordSearch(details) {
  const { kind, query, options } = details;
  if (!LOGGED_KINDS.has(kind)) return null;
  if (!options.orgId || !options.userId || !normalizeQuery(query)) return null;
  const id = randomUUID();
  const write = insertSearchEvent(id, details).finally(() => pendingEvents.delete(id));
  pendingEvents.set(id, write);
  runInBackground(write);
  return id;
}

/**
 * Completes a chat event once the answer has streamed (E29.2 time-to-answer):
 * `firstTokenMs` is query to first answer token. Never throws.
 */
export async function completeSearchEvent(searchEventId, { firstTokenMs, answerShown, confidence, orgMessageId } = {}) {
  if (!searchEventId) return;
  try {
    const pending = pendingEvents.get(searchEventId);
    if (pending && !(await pending)) return;
    await prisma.searchEvent.updateMany({
      where: { id: searchEventId },
      data: {
        ...(Number.isFinite(firstTokenMs) ? { firstTokenMs: Math.max(0, Math.round(firstTokenMs)) } : {}),
        ...(typeof answerShown === "boolean" ? { answerShown } : {}),
        ...(confidence ? { confidence: String(confidence) } : {}),
        ...(orgMessageId ? { orgMessageId } : {}),
      },
    });
  } catch (error) {
    console.warn("Search telemetry update unavailable:", error?.message);
  }
}

export async function search({ kind = "search", query, queryEmbedding, ...options }) {
  const startedAt = Date.now();
  if (kind === "repository") {
    if (!Array.isArray(queryEmbedding) || queryEmbedding.length === 0) {
      throw new Error("Repository semantic search requires a query embedding");
    }
    const results = await orgSearch(queryEmbedding, options);
    const searchEventId = recordSearch({ kind, query, options, resultCount: results.length, latencyMs: Date.now() - startedAt });
    return { results, searchEventId };
  }

  // Do not alter query expansion, embeddings, ranking or access rules here.
  // Existing callers continue supplying the same retrieval parameters.
  const results = await hybridOrgSearch(options);
  const searchEventId = recordSearch({ kind, query, options, resultCount: results.length, latencyMs: Date.now() - startedAt });
  return { results, searchEventId };
}
