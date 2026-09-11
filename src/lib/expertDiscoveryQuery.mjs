import { Prisma } from "@prisma/client";

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

export async function getAccessibleExpertsWithPrisma(prisma, { orgId, userId, query = "", topicId = null, isSuperAdmin = false, limit = 20 }) {
  const access = expertTopicAccessSql({ userId, isSuperAdmin });
  const trimmed = String(query || "").trim();
  const pattern = `%${trimmed}%`;
  const safeLimit = Math.max(1, Math.min(50, Number(limit) || 20));

  return prisma.$queryRaw`
    SELECT u.id, u.name, u.email, t.id AS "topicId", t.name AS topic, t.scope AS "topicScope",
           MAX(te.score)::float AS score, te.source, te."lastSignalAt",
           COUNT(DISTINCT td."documentId")::int AS "documentCount"
    FROM "TopicExpertise" te
    JOIN "Topic" t ON t.id = te."topicId"
    JOIN "User" u ON u.id = te."userId"
    JOIN "TopicDocument" td ON td."topicId" = t.id
    JOIN "Document" d ON d.id = td."documentId"
    WHERE COALESCE(t."orgId", d."orgId") = ${orgId}
      AND te.source <> 'dismissed'
      AND (${topicId}::text IS NULL OR t.id = ${topicId})
      AND (${trimmed} = '' OR t.name ILIKE ${pattern} OR d.filename ILIKE ${pattern} OR d.summary ILIKE ${pattern})
      AND ${access}
    GROUP BY u.id, u.name, u.email, t.id, t.name, t.scope, te.source, te."lastSignalAt"
    ORDER BY score DESC, "documentCount" DESC
    LIMIT ${Prisma.raw(String(safeLimit))}
  `;
}
