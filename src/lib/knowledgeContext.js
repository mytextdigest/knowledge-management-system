import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const RELATED_DOCUMENT_MIN_WEIGHT = 0.68;

function accessSql({ userId, isSuperAdmin = false, alias = "d" }) {
  const table = Prisma.raw(`"${alias}"`);
  return Prisma.sql`(
    ${isSuperAdmin}
    OR (${table}.scope = 'repository' AND ${table}.lifecycle = 'published' AND (
      ${table}."departmentId" IS NULL OR EXISTS (
        SELECT 1 FROM "DepartmentMember" dm
        WHERE dm."departmentId" = ${table}."departmentId" AND dm."userId" = ${userId}
      )
    ))
    OR EXISTS (
      SELECT 1 FROM "Project" p
      WHERE p.id = ${table}."projectId" AND p.scope = 'org' AND (
        ${isSuperAdmin} OR EXISTS (
          SELECT 1 FROM "DepartmentMember" pm
          WHERE pm."departmentId" = p."departmentId" AND pm."userId" = ${userId}
        )
      )
    )
    OR ${table}."userId" = ${userId}
  )`;
}

export async function getAccessibleRelatedDocuments({ documentId, orgId, userId, isSuperAdmin = false, limit = 6 }) {
  const access = accessSql({ userId, isSuperAdmin, alias: "related" });
  return prisma.$queryRaw`
    SELECT related.id, related.filename, related.category, related."departmentId",
           dept.name AS "departmentName", r.type, r.weight, r.evidence
    FROM "DocumentRelationship" r
    JOIN "Document" related ON related.id = CASE
      WHEN r."fromDocumentId" = ${documentId} THEN r."toDocumentId" ELSE r."fromDocumentId" END
    LEFT JOIN "Department" dept ON dept.id = related."departmentId"
    WHERE r."orgId" = ${orgId}
      AND (r."fromDocumentId" = ${documentId} OR r."toDocumentId" = ${documentId})
      AND r.weight >= ${RELATED_DOCUMENT_MIN_WEIGHT}
      AND ${access}
    ORDER BY r.weight DESC
    LIMIT ${Prisma.raw(String(Math.max(1, Math.min(20, limit))))}
  `;
}

export async function getAccessibleExperts({ orgId, userId, query, isSuperAdmin = false, limit = 5 }) {
  const access = accessSql({ userId, isSuperAdmin, alias: "d" });
  const pattern = `%${String(query || "").trim()}%`;
  return prisma.$queryRaw`
    SELECT u.id, u.name, u.email, t.name AS topic, MAX(te.score)::float AS score,
           COUNT(DISTINCT td."documentId")::int AS "documentCount"
    FROM "TopicExpertise" te
    JOIN "Topic" t ON t.id = te."topicId"
    JOIN "User" u ON u.id = te."userId"
    JOIN "TopicDocument" td ON td."topicId" = t.id
    JOIN "Document" d ON d.id = td."documentId"
    WHERE t."orgId" = ${orgId} AND t.scope = 'repository'
      AND (t.name ILIKE ${pattern} OR d.filename ILIKE ${pattern} OR d.summary ILIKE ${pattern})
      AND ${access}
    GROUP BY u.id, u.name, u.email, t.name
    ORDER BY score DESC, "documentCount" DESC
    LIMIT ${Prisma.raw(String(Math.max(1, Math.min(20, limit))))}
  `;
}

export async function expandWithRelatedDocuments({ rows, orgId, userId, isSuperAdmin = false, limit = 8 }) {
  const seedIds = [...new Set(rows.slice(0, 4).map((row) => row.document_id).filter(Boolean))];
  if (!seedIds.length) return rows.slice(0, limit);
  const access = accessSql({ userId, isSuperAdmin, alias: "d" });
  const related = await prisma.$queryRaw`
    SELECT DISTINCT ON (d.id) NULL::text AS id, NULL::text AS text, d.summary,
      NULL::int AS chunk_index, d.id AS document_id, NULL::jsonb AS metadata,
      d.filename, d.file_path AS "filePath", d."orgId", d."departmentId", d."projectId", d.scope, d.category,
      dept.name AS department_name, proj.name AS project_name,
      (1 - r.weight)::float AS distance, 0::float AS keyword_score, r.weight::float AS relationship_score
    FROM "DocumentRelationship" r
    JOIN "Document" d ON d.id = CASE WHEN r."fromDocumentId" = ANY(${seedIds}::text[])
      THEN r."toDocumentId" ELSE r."fromDocumentId" END
    LEFT JOIN "Department" dept ON dept.id = d."departmentId"
    LEFT JOIN "Project" proj ON proj.id = d."projectId"
    WHERE r."orgId" = ${orgId} AND r.weight >= ${RELATED_DOCUMENT_MIN_WEIGHT}
      AND (r."fromDocumentId" = ANY(${seedIds}::text[]) OR r."toDocumentId" = ANY(${seedIds}::text[]))
      AND NOT (d.id = ANY(${seedIds}::text[])) AND ${access}
    ORDER BY d.id, r.weight DESC
    LIMIT 6
  `;
  const seen = new Set(rows.map((r) => r.document_id));
  const additions = related.filter((r) => !seen.has(r.document_id)).map((r) => ({
    ...r, vectorScore: Number(r.relationship_score || 0), keywordScore: 0,
    hybridScore: Number(r.relationship_score || 0) * 0.72, relationshipDerived: true,
  }));
  return [...rows, ...additions]
    .sort((a,b) => Number(b.hybridScore || 0) - Number(a.hybridScore || 0))
    .slice(0, limit);
}
