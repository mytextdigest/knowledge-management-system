import { Prisma } from "@prisma/client";

const SEMANTIC_TOPIC_THRESHOLD = 0.3;
const SEMANTIC_TOPIC_CANDIDATES = 25;

function cosineSimilarity(a, b) {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Ranks this org's topics (repository- and project-scoped) by embedding
 * similarity to a pre-computed query embedding. Topics without a usable
 * centroid (never classified, or a dimension mismatch from an older model)
 * are skipped rather than erroring. Returns null if there's nothing to
 * compute against; the caller falls back to text matching in that case.
 */
async function rankTopicsBySemanticSimilarity(prisma, { orgId, queryEmbedding }) {
  if (!Array.isArray(queryEmbedding) || queryEmbedding.length !== 1536) return null;
  const topics = await prisma.topic.findMany({
    where: { OR: [{ orgId }, { project: { orgId } }] },
    select: { id: true, centroidEmbedding: true },
  });
  const scored = topics
    .map((t) => {
      const centroid = t.centroidEmbedding;
      if (!Array.isArray(centroid) || centroid.length !== 1536) return null;
      return { id: t.id, sim: cosineSimilarity(queryEmbedding, centroid) };
    })
    .filter((t) => t && t.sim >= SEMANTIC_TOPIC_THRESHOLD)
    .sort((a, b) => b.sim - a.sim)
    .slice(0, SEMANTIC_TOPIC_CANDIDATES);
  return scored.map((t) => t.id);
}

/**
 * SQL-level access rule for expertise/topic discovery.
 *
 * Important: this gates both the document/topic and the expert association.
 * A repository topic may span multiple departments, so merely finding one
 * accessible document in that topic is not enough to expose every expert row
 * attached to the topic. The expert must also be connected to that accessible
 * department/document (or be an org super admin).
 */
function expertTopicAccessSql({ userId, isSuperAdmin = false }) {
  return Prisma.sql`(
    ${isSuperAdmin}
    OR (
      t.scope = 'repository'
      AND d.scope = 'repository'
      AND d.lifecycle = 'published'
      AND (d."departmentId" IS NULL OR EXISTS (
        SELECT 1 FROM "DepartmentMember" viewer_dm
        WHERE viewer_dm."departmentId" = d."departmentId"
          AND viewer_dm."userId" = ${userId}
      ))
      AND (
        d."departmentId" IS NULL
        OR te."userId" = d."userId"
        OR EXISTS (
          SELECT 1 FROM "DepartmentMember" expert_dm
          WHERE expert_dm."departmentId" = d."departmentId"
            AND expert_dm."userId" = te."userId"
        )
        OR EXISTS (
          SELECT 1 FROM "OrganizationMember" expert_om
          WHERE expert_om."orgId" = COALESCE(t."orgId", d."orgId")
            AND expert_om."userId" = te."userId"
            AND expert_om.role = 'super_admin'
        )
      )
    )
    OR (
      t.scope = 'project'
      AND t."projectId" IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM "Project" p
        WHERE p.id = t."projectId"
          AND (
            p."userId" = ${userId}
            OR (p.scope = 'org' AND EXISTS (
              SELECT 1 FROM "DepartmentMember" viewer_pm
              WHERE viewer_pm."departmentId" = p."departmentId"
                AND viewer_pm."userId" = ${userId}
            ))
          )
          AND (
            te."userId" = p."userId"
            OR EXISTS (
              SELECT 1 FROM "DepartmentMember" expert_pm
              WHERE expert_pm."departmentId" = p."departmentId"
                AND expert_pm."userId" = te."userId"
            )
            OR EXISTS (
              SELECT 1 FROM "OrganizationMember" expert_om
              WHERE expert_om."orgId" = p."orgId"
                AND expert_om."userId" = te."userId"
                AND expert_om.role = 'super_admin'
            )
          )
      )
    )
  )`;
}

/**
 * Topic-only visibility check used by one-click confirmation/correction.
 * This deliberately does not require an existing TopicExpertise row, allowing
 * an authorized dept admin to designate a department member as an SME.
 */
export async function isExpertTopicAccessibleWithPrisma(prisma, { orgId, userId, topicId, isSuperAdmin = false }) {
  if (!topicId) return false;
  const rows = await prisma.$queryRaw`
    SELECT 1
    FROM "Topic" t
    JOIN "TopicDocument" td ON td."topicId" = t.id
    JOIN "Document" d ON d.id = td."documentId"
    WHERE t.id = ${topicId}
      AND COALESCE(t."orgId", d."orgId") = ${orgId}
      AND (
        ${isSuperAdmin}
        OR (
          t.scope = 'repository'
          AND d.scope = 'repository'
          AND d.lifecycle = 'published'
          AND (d."departmentId" IS NULL OR EXISTS (
            SELECT 1 FROM "DepartmentMember" dm
            WHERE dm."departmentId" = d."departmentId" AND dm."userId" = ${userId}
          ))
        )
        OR (
          t.scope = 'project'
          AND t."projectId" IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM "Project" p
            WHERE p.id = t."projectId"
              AND (p."userId" = ${userId} OR (p.scope = 'org' AND EXISTS (
                SELECT 1 FROM "DepartmentMember" pm
                WHERE pm."departmentId" = p."departmentId" AND pm."userId" = ${userId}
              )))
          )
        )
      )
    LIMIT 1
  `;
  return rows.length > 0;
}

export async function getAccessibleExpertsWithPrisma(prisma, { orgId, userId, query = "", topicId = null, isSuperAdmin = false, limit = 20, queryEmbedding = null }) {
  const access = expertTopicAccessSql({ userId, isSuperAdmin });
  const trimmed = String(query || "").trim();
  const safeLimit = Math.max(1, Math.min(50, Number(limit) || 20));

  // Word-based fallback: every typed word must appear *somewhere* relevant
  // (topic name, document filename/summary, or project name), rather than
  // requiring the whole phrase to appear verbatim as one substring - that
  // old behavior broke on word reordering (e.g. "assistant knowledge") and
  // never searched the project name at all (e.g. "kms" matching nothing
  // relevant). It still has no typo tolerance, which is why semantic
  // ranking is tried first below.
  const words = trimmed ? trimmed.split(/\s+/).filter(Boolean) : [];
  const wordConditions = words.map((w) => {
    const wp = `%${w}%`;
    return Prisma.sql`(t.name ILIKE ${wp} OR d.filename ILIKE ${wp} OR d.summary ILIKE ${wp} OR p.name ILIKE ${wp})`;
  });

  // Semantic ranking: rank topics by embedding similarity to the query so a
  // typo, a rephrasing, or a related-but-not-identical term (e.g. "knowledge
  // assistant" for a topic literally named "Conversational Knowledge
  // Assistant Implementation") still surfaces the right experts. Combined
  // with the word-based filter (OR, not instead-of) because a literal term
  // like a project's exact name/acronym can be a better match than anything
  // embedding similarity finds, and neither approach alone should be able to
  // hide a match the other one found.
  const semanticTopicIds = await rankTopicsBySemanticSimilarity(prisma, { orgId, queryEmbedding });
  let searchFilter;
  if (!wordConditions.length) {
    searchFilter = Prisma.sql`TRUE`;
  } else {
    const wordFilter = Prisma.join(wordConditions, " AND ");
    searchFilter = (semanticTopicIds && semanticTopicIds.length)
      ? Prisma.sql`(${wordFilter} OR t.id IN (${Prisma.join(semanticTopicIds)}))`
      : wordFilter;
  }

  // A topic name alone (e.g. "Implementation Tracker") is often ambiguous -
  // the same generic name can exist under unrelated projects. project/dept
  // disambiguates it. For a project-scope topic this is exact (one project
  // per topic); for a repository-scope topic spanning multiple departments,
  // MAX() picks one deterministically rather than trying to list them all.
  return prisma.$queryRaw`
    SELECT u.id, u.name, u.email, t.id AS "topicId", t.name AS topic, t.scope AS "topicScope",
           MAX(te.score)::float AS score, te.source, te."lastSignalAt", te.signals,
           COUNT(DISTINCT td."documentId")::int AS "documentCount",
           MAX(p.name) AS "projectName", MAX(dept.name) AS "departmentName"
    FROM "TopicExpertise" te
    JOIN "Topic" t ON t.id = te."topicId"
    JOIN "User" u ON u.id = te."userId"
    JOIN "TopicDocument" td ON td."topicId" = t.id
    JOIN "Document" d ON d.id = td."documentId"
    LEFT JOIN "Project" p ON p.id = t."projectId"
    LEFT JOIN "Department" dept ON dept.id = COALESCE(p."departmentId", d."departmentId")
    WHERE COALESCE(t."orgId", d."orgId") = ${orgId}
      AND te.source <> 'dismissed'
      AND (${topicId}::text IS NULL OR t.id = ${topicId})
      AND ${searchFilter}
      AND ${access}
    GROUP BY u.id, u.name, u.email, t.id, t.name, t.scope, te.source, te."lastSignalAt", te.signals
    ORDER BY score DESC, "documentCount" DESC
    LIMIT ${Prisma.raw(String(safeLimit))}
  `;
}
