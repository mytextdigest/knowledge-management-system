import { Prisma, PrismaClient } from "@prisma/client";
import { classifyRepositoryDocument } from "./cluster.js";
import { getOpenAIForDocument } from "./openai.js";
import { computeExpertiseScore } from "../src/lib/expertiseScoringPolicy.mjs";
import { RELATIONSHIP_MIN_CONFIDENCE, RELATIONSHIP_MAX_PER_DOCUMENT, relationshipConfidence, classifyRelationship } from "../src/lib/relationshipScoringPolicy.mjs";

const prisma = new PrismaClient();
const SOURCE_CHUNK_LIMIT = 8;
const NEIGHBORS_PER_CHUNK = 40;

async function findRelatedDocumentsWithPgvector(doc) {
  // A project association is the durable signal here, not the historical Document.scope value.
  // Older KMS data can legitimately be scope="private" while still belonging to an
  // org-scoped project. Include same-project candidates for those records too; all
  // user-facing relationship reads remain RBAC-filtered in src/lib/knowledgeContext.js.
  const projectFilter = doc.projectId
    ? Prisma.sql`AND (d."projectId" = ${doc.projectId} OR (d.scope = 'repository' AND d.lifecycle = 'published'))`
    : Prisma.sql`AND d.scope = 'repository' AND d.lifecycle = 'published'`;
  return prisma.$queryRaw`
    WITH source_chunks AS (
      SELECT c.embedding_vec FROM "Chunk" c
      WHERE c.document_id = ${doc.id} AND c.embedding_vec IS NOT NULL
      ORDER BY c.chunk_index NULLS LAST LIMIT ${Prisma.raw(String(SOURCE_CHUNK_LIMIT))}
    ), nearest AS (
      SELECT candidate.document_id, MAX(1 - (candidate.embedding_vec <=> source.embedding_vec))::float AS similarity
      FROM source_chunks source
      CROSS JOIN LATERAL (
        SELECT c.document_id, c.embedding_vec FROM "Chunk" c JOIN "Document" d ON d.id = c.document_id
        WHERE c.embedding_vec IS NOT NULL AND c.document_id <> ${doc.id}
          AND d."orgId" = ${doc.orgId} ${projectFilter}
        ORDER BY c.embedding_vec <=> source.embedding_vec LIMIT ${Prisma.raw(String(NEIGHBORS_PER_CHUNK))}
      ) candidate GROUP BY candidate.document_id
    )
    SELECT d.id, d.filename, COALESCE(n.similarity, 0)::float AS similarity
    FROM nearest n JOIN "Document" d ON d.id = n.document_id
    ORDER BY n.similarity DESC LIMIT ${Prisma.raw(String(RELATIONSHIP_MAX_PER_DOCUMENT))}
  `;
}

async function loadRelationshipSignals(doc, candidates) {
  const ids = candidates.map((c) => c.id);
  if (!ids.length) return [];
  const details = await prisma.document.findMany({
    where: { id: { in: ids } },
    select: { id: true, projectId: true, topicDocument: { select: { topicId: true } }, entities: { select: { name: true, type: true } }, lessons: { select: { decisionId: true, projectId: true } } },
  });
  const source = await prisma.document.findUnique({
    where: { id: doc.id },
    select: { projectId: true, topicDocument: { select: { topicId: true } }, entities: { select: { name: true, type: true } }, decisions: { select: { id: true } }, lessons: { select: { decisionId: true, projectId: true } }, projectLinks: { where: { status: { not: "suggested" } }, select: { projectId: true } } },
  });
  const sourceEntities = new Set((source?.entities || []).map((e) => `${e.type}:${e.name.toLowerCase()}`));
  const sourceProjects = new Set([source?.projectId, ...(source?.projectLinks || []).map((x) => x.projectId)].filter(Boolean));
  const sourceDecisionIds = new Set((source?.decisions || []).map((d) => d.id));
  const sourceLessonProjects = new Set((source?.lessons || []).map((l) => l.projectId).filter(Boolean));
  return candidates.map((candidate) => {
    const other = details.find((d) => d.id === candidate.id);
    const sharedEntities = (other?.entities || []).filter((e) => sourceEntities.has(`${e.type}:${e.name.toLowerCase()}`));
    const topicOverlap = source?.topicDocument?.topicId && source.topicDocument.topicId === other?.topicDocument?.topicId ? 1 : 0;
    const entityOverlap = Math.min(1, sharedEntities.length / 3);
    const projectContext = other?.projectId && sourceProjects.has(other.projectId) ? 1 : 0;
    const decisionChain = (other?.lessons || []).some((l) => l.decisionId && sourceDecisionIds.has(l.decisionId));
    const sharedLessonProject = (other?.lessons || []).some((l) => l.projectId && sourceLessonProjects.has(l.projectId));
    const lessonEvidence = decisionChain || sharedLessonProject ? 1 : 0;
    const signals = { embeddingSimilarity: Number(candidate.similarity || 0), topicOverlap, entityOverlap, projectContext, lessonEvidence };
    return { ...candidate, signals, sharedEntities: sharedEntities.map((e) => e.name), confidence: relationshipConfidence(signals), lessonDetails: { decisionChain, sharedLessonProject } };
  });
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
      entities: { select: { name: true, type: true } },
      decisions: { select: { id: true } },
      lessons: { select: { decisionId: true, projectId: true } },
    },
  });
  if (!doc?.orgId) return { skipped: true };

  const embeddingCandidates = await findRelatedDocumentsWithPgvector(doc);
  // Candidate expansion is deliberately independent of embedding strength so
  // shared topics/entities/project context can discover pairs embeddings miss.
  const structuralCandidates = await prisma.document.findMany({
    where: {
      id: { not: doc.id }, orgId: doc.orgId,
      AND: [
        doc.projectId
          ? { OR: [{ projectId: doc.projectId }, { scope: "repository", lifecycle: "published" }] }
          : { scope: "repository", lifecycle: "published" },
        { OR: [
        ...(doc.topicDocument?.topicId ? [{ topicDocument: { is: { topicId: doc.topicDocument.topicId } } }] : []),
        ...(doc.projectId ? [{ projectId: doc.projectId }, { projectLinks: { some: { projectId: doc.projectId, status: { not: "suggested" } } } }] : []),
        ...((doc.entities || []).length ? [{ entities: { some: { OR: doc.entities.map((entity) => ({ name: entity.name, type: entity.type })) } } }] : []),
        ...((doc.decisions || []).length ? [{ lessons: { some: { decisionId: { in: doc.decisions.map((decision) => decision.id) } } } }] : []),
        ...((doc.lessons || []).some((lesson) => lesson.projectId) ? [{ lessons: { some: { projectId: { in: doc.lessons.map((lesson) => lesson.projectId).filter(Boolean) } } } }] : []),
        ] },
      ],
    },
    select: { id: true, filename: true }, take: RELATIONSHIP_MAX_PER_DOCUMENT,
  });
  const byId = new Map(embeddingCandidates.map((c) => [c.id, c]));
  for (const candidate of structuralCandidates) if (!byId.has(candidate.id)) byId.set(candidate.id, { ...candidate, similarity: 0 });
  const related = (await loadRelationshipSignals(doc, [...byId.values()]))
    .filter((candidate) => candidate.confidence >= RELATIONSHIP_MIN_CONFIDENCE)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, RELATIONSHIP_MAX_PER_DOCUMENT);
  for (const other of related) {
    const type = classifyRelationship({ content: doc.content, otherName: other.filename, signals: other.signals });
    const [fromDocumentId, toDocumentId] = [doc.id, other.id].sort();
    await prisma.documentRelationship.upsert({
      where: { fromDocumentId_toDocumentId_type: { fromDocumentId, toDocumentId, type } },
      create: {
        orgId: doc.orgId,
        fromDocumentId,
        toDocumentId,
        type,
        weight: other.confidence,
        evidence: { ...other.signals, sharedEntities: other.sharedEntities, lessonDetails: other.lessonDetails, strategy: "multi_signal_v1" },
      },
      update: {
        weight: other.confidence,
        evidence: { ...other.signals, sharedEntities: other.sharedEntities, lessonDetails: other.lessonDetails, strategy: "multi_signal_v1" },
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
