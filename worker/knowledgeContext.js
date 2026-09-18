import { Prisma, PrismaClient } from "@prisma/client";
import { classifyRepositoryDocument } from "./cluster.js";
import { getOpenAIForDocument } from "./openai.js";
import { computeExpertiseScore } from "../src/lib/expertiseScoringPolicy.mjs";

const prisma = new PrismaClient();
const RELATED_THRESHOLD = 0.72;
const SOURCE_CHUNK_LIMIT = 8;
const NEIGHBORS_PER_CHUNK = 40;

function relationshipType(content, otherName) {
  const text = String(content || "").toLowerCase();
  const name = String(otherName || "").replace(/\.[^.]+$/, "").toLowerCase();
  if (name.length > 5 && text.includes(name)) return "references";
  if (/supersedes|replaces|obsolete|new version/.test(text)) return "supersedes";
  return "related";
}

async function findRelatedDocumentsWithPgvector(doc) {
  // Each source chunk performs an indexed pgvector nearest-neighbor lookup.
  // The candidate set is bounded before aggregation, avoiding the prior
  // full-document/full-embedding load and O(N²) Node-side scan.
  return prisma.$queryRaw`
    WITH source_chunks AS (
      SELECT c.embedding_vec
      FROM "Chunk" c
      WHERE c.document_id = ${doc.id}
        AND c.embedding_vec IS NOT NULL
      ORDER BY c.chunk_index NULLS LAST
      LIMIT ${Prisma.raw(String(SOURCE_CHUNK_LIMIT))}
    ), nearest AS (
      SELECT candidate.document_id,
             MAX(1 - (candidate.embedding_vec <=> source.embedding_vec))::float AS similarity
      FROM source_chunks source
      CROSS JOIN LATERAL (
        SELECT c.document_id, c.embedding_vec
        FROM "Chunk" c
        JOIN "Document" d ON d.id = c.document_id
        WHERE c.embedding_vec IS NOT NULL
          AND c.document_id <> ${doc.id}
          AND d."orgId" = ${doc.orgId}
          AND d.scope = 'repository'
          AND d.lifecycle = 'published'
        ORDER BY c.embedding_vec <=> source.embedding_vec
        LIMIT ${Prisma.raw(String(NEIGHBORS_PER_CHUNK))}
      ) candidate
      GROUP BY candidate.document_id
    )
    SELECT d.id, d.filename, n.similarity
    FROM nearest n
    JOIN "Document" d ON d.id = n.document_id
    WHERE n.similarity >= ${RELATED_THRESHOLD}
    ORDER BY n.similarity DESC
    LIMIT 30
  `;
}

async function refreshTopicExpertise(topicId, orgId) {
  const uploaderSignals = await prisma.$queryRaw`
    SELECT d."userId" AS "userId", COUNT(*)::int AS uploads, MAX(d."created_at") AS "lastSignalAt"
    FROM "TopicDocument" td
    JOIN "Document" d ON d.id = td."documentId"
    WHERE td."topicId" = ${topicId}
    GROUP BY d."userId"
  `;

  const citerSignals = await prisma.$queryRaw`
    SELECT cal."userId" AS "userId", COUNT(*)::int AS citations, MAX(cal."created_at") AS "lastSignalAt"
    FROM "ChatAuditLog" cal
    WHERE cal."orgId" = ${orgId}
      AND EXISTS (
        SELECT 1 FROM "TopicDocument" td
        WHERE td."topicId" = ${topicId} AND td."documentId" = ANY(cal."citedDocIds")
      )
    GROUP BY cal."userId"
  `;

  const departmentSignals = await prisma.$queryRaw`
    SELECT dm."userId" AS "userId", COUNT(DISTINCT d."departmentId")::int AS departments,
           MAX(td."assigned_at") AS "lastSignalAt"
    FROM "TopicDocument" td
    JOIN "Document" d ON d.id = td."documentId" AND d."departmentId" IS NOT NULL
    JOIN "DepartmentMember" dm ON dm."departmentId" = d."departmentId"
    WHERE td."topicId" = ${topicId}
    GROUP BY dm."userId"
  `;

  const interactionSignals = await prisma.$queryRaw`
    SELECT di."userId" AS "userId", COUNT(*)::int AS interactions, MAX(di."created_at") AS "lastSignalAt"
    FROM "DocumentInteraction" di
    JOIN "TopicDocument" td ON td."documentId" = di."documentId"
    WHERE td."topicId" = ${topicId} AND di."orgId" = ${orgId}
      AND di.type IN ('view', 'download')
    GROUP BY di."userId"
  `;

  // Asking real questions about a document is active engagement, not a
  // click - the length filter discourages one-word/junk messages from
  // counting as "study".
  const documentQuestionSignals = await prisma.$queryRaw`
    SELECT c."userId" AS "userId", COUNT(*)::int AS "documentQuestions", MAX(m."created_at") AS "lastSignalAt"
    FROM "Message" m
    JOIN "Conversation" c ON c.id = m."conversation_id"
    JOIN "TopicDocument" td ON td."documentId" = c."document_id"
    WHERE td."topicId" = ${topicId}
      AND m.role = 'user'
      AND LENGTH(TRIM(COALESCE(m.content, ''))) > 10
    GROUP BY c."userId"
  `;

  // Authoring a published Lesson Learned tied to a document is the strongest
  // "studied and synthesized this" signal available - drafts don't count,
  // since they haven't been reviewed yet.
  const lessonAuthorSignals = await prisma.$queryRaw`
    SELECT l."authorUserId" AS "userId", COUNT(*)::int AS "lessonsAuthored", MAX(l."created_at") AS "lastSignalAt"
    FROM "Lesson" l
    JOIN "TopicDocument" td ON td."documentId" = l."documentId"
    WHERE td."topicId" = ${topicId}
      AND l.status = 'published'
    GROUP BY l."authorUserId"
  `;

  // Genuine reading time, reported by the document page's dwell-time timer
  // (visibility-aware, 15s-1200s per report - see the interactions route).
  const dwellSignals = await prisma.$queryRaw`
    SELECT di."userId" AS "userId", (SUM(di."durationSeconds")::float / 60) AS "dwellMinutes", MAX(di."created_at") AS "lastSignalAt"
    FROM "DocumentInteraction" di
    JOIN "TopicDocument" td ON td."documentId" = di."documentId"
    WHERE td."topicId" = ${topicId} AND di."orgId" = ${orgId}
      AND di.type = 'study_duration' AND di."durationSeconds" IS NOT NULL
    GROUP BY di."userId"
  `;

  const scores = new Map();
  const ensure = (userId) => {
    if (!scores.has(userId)) scores.set(userId, {
      uploads: 0, citations: 0, departments: 0, interactions: 0,
      documentQuestions: 0, lessonsAuthored: 0, dwellMinutes: 0, lastSignalAt: null,
    });
    return scores.get(userId);
  };
  const apply = (rows, field) => rows.forEach((row) => {
    const target = ensure(row.userId);
    target[field] = Number(row[field] || 0);
    const timestamp = row.lastSignalAt ? new Date(row.lastSignalAt) : null;
    if (timestamp && (!target.lastSignalAt || timestamp > target.lastSignalAt)) target.lastSignalAt = timestamp;
  });
  apply(uploaderSignals, 'uploads');
  apply(citerSignals, 'citations');
  apply(departmentSignals, 'departments');
  apply(interactionSignals, 'interactions');
  apply(documentQuestionSignals, 'documentQuestions');
  apply(lessonAuthorSignals, 'lessonsAuthored');
  apply(dwellSignals, 'dwellMinutes');

  const existing = await prisma.topicExpertise.findMany({ where: { topicId } });
  const existingByUser = new Map(existing.map((row) => [row.userId, row]));
  const activeUserIds = [];

  for (const [userId, signals] of scores) {
    const score = computeExpertiseScore(signals);
    if (score <= 0) continue;
    activeUserIds.push(userId);
    const current = existingByUser.get(userId);
    if (current?.source === 'dismissed') continue;
    const protectedSource = current && current.source !== 'inferred';
    await prisma.topicExpertise.upsert({
      where: { topicId_userId: { topicId, userId } },
      create: { topicId, userId, score, signals, source: 'inferred', lastSignalAt: signals.lastSignalAt },
      update: protectedSource
        ? { score: Math.max(Number(current.score || 0), score), signals, lastSignalAt: signals.lastSignalAt }
        : { score, signals, lastSignalAt: signals.lastSignalAt },
    });
  }

  await prisma.topicExpertise.deleteMany({
    where: {
      topicId,
      source: 'inferred',
      ...(activeUserIds.length ? { userId: { notIn: activeUserIds } } : {}),
    },
  });
}

async function suggestProjectLinks(doc) {
  const projects = await prisma.project.findMany({
    where: { orgId: doc.orgId },
    select: { id: true, name: true },
  });
  const haystack = `${doc.filename} ${doc.summary || ""} ${doc.content || ""}`.toLowerCase();
  for (const project of projects) {
    const name = project.name.toLowerCase();
    if (name.length < 3 || !haystack.includes(name)) continue;
    await prisma.documentProjectLink.upsert({
      where: { documentId_projectId: { documentId: doc.id, projectId: project.id } },
      create: {
        documentId: doc.id,
        projectId: project.id,
        confidence: 0.92,
        evidence: `Project name “${project.name}” appears in the document.`,
      },
      update: {
        confidence: 0.92,
        evidence: `Project name “${project.name}” appears in the document.`,
        status: "suggested",
      },
    });
  }
}

export async function processKnowledgeContext(docId) {
  const doc = await prisma.document.findUnique({
    where: { id: docId },
    select: {
      id: true,
      orgId: true,
      scope: true,
      filename: true,
      content: true,
      summary: true,
      projectId: true,
      topicDocument: { select: { topicId: true } },
    },
  });
  if (!doc?.orgId) return { skipped: true };
  if (doc.scope !== "repository") {
    if (doc.topicDocument?.topicId) {
      await refreshTopicExpertise(doc.topicDocument.topicId, doc.orgId);
      return { topicId: doc.topicDocument.topicId, relationships: 0 };
    }
    return { skipped: true };
  }

  const related = await findRelatedDocumentsWithPgvector(doc);
  for (const other of related) {
    const type = relationshipType(doc.content, other.filename);
    const [fromDocumentId, toDocumentId] = [doc.id, other.id].sort();
    await prisma.documentRelationship.upsert({
      where: { fromDocumentId_toDocumentId_type: { fromDocumentId, toDocumentId, type } },
      create: {
        orgId: doc.orgId,
        fromDocumentId,
        toDocumentId,
        type,
        weight: Number(other.similarity),
        evidence: { embeddingSimilarity: Number(other.similarity), strategy: "pgvector_chunk_knn" },
      },
      update: {
        weight: Number(other.similarity),
        evidence: { embeddingSimilarity: Number(other.similarity), strategy: "pgvector_chunk_knn" },
      },
    });
  }

  const openai = await getOpenAIForDocument(doc.id);
  const topic = await classifyRepositoryDocument(doc.id, doc.orgId, openai);
  if (topic?.topicId) await refreshTopicExpertise(topic.topicId, doc.orgId);
  await suggestProjectLinks(doc);
  return { topicId: topic?.topicId || null, relationships: related.length };
}

export { findRelatedDocumentsWithPgvector, refreshTopicExpertise };
