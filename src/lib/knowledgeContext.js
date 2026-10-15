import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getAccessibleExpertsWithPrisma } from "@/lib/expertDiscoveryQuery.mjs";
import { RELATIONSHIP_MIN_CONFIDENCE } from "./relationshipScoringPolicy.mjs";
import { knowledgeAccessSql } from "@/lib/access/documentAccess";

export const RELATED_DOCUMENT_MIN_WEIGHT = RELATIONSHIP_MIN_CONFIDENCE;

export async function getAccessibleRelatedDocuments({ documentId, orgId, userId, isSuperAdmin = false, limit = 6 }) {
  const access = knowledgeAccessSql({ userId, isSuperAdmin, alias: "related" });
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

export async function getAccessibleExperts(args) {
  return getAccessibleExpertsWithPrisma(prisma, args);
}

export async function expandWithRelatedDocuments({ rows, orgId, userId, isSuperAdmin = false, limit = 8 }) {
  const seedIds = [...new Set(rows.slice(0, 4).map((row) => row.document_id).filter(Boolean))];
  if (!seedIds.length) return rows.slice(0, limit);
  const access = knowledgeAccessSql({ userId, isSuperAdmin, alias: "d" });
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


export async function getAccessibleOrgRelationships({ orgId, userId, isSuperAdmin = false, limit = 100 }) {
  const fromAccess = knowledgeAccessSql({ userId, isSuperAdmin, alias: "a" });
  const toAccess = knowledgeAccessSql({ userId, isSuperAdmin, alias: "b" });
  const safeLimit = Prisma.raw(String(Math.max(1, Math.min(250, Number(limit) || 100))));
  const relationships = await prisma.$queryRaw`
    SELECT r.id, 'relationship'::text AS kind, r.type, r.weight, r.evidence,
      a.id AS "fromDocumentId", a.filename AS "fromFilename",
      b.id AS "toDocumentId", b.filename AS "toFilename", r."updated_at" AS "createdAt"
    FROM "DocumentRelationship" r
    JOIN "Document" a ON a.id = r."fromDocumentId"
    JOIN "Document" b ON b.id = r."toDocumentId"
    WHERE r."orgId" = ${orgId} AND ${fromAccess} AND ${toAccess}
    ORDER BY r.weight DESC LIMIT ${safeLimit}
  `;
  const conflicts = await prisma.$queryRaw`
    SELECT c.id, 'conflict'::text AS kind, 'conflict'::text AS type, 1::float AS weight,
      jsonb_build_object('summary', c.summary, 'status', c.status) AS evidence,
      a.id AS "fromDocumentId", a.filename AS "fromFilename",
      b.id AS "toDocumentId", b.filename AS "toFilename", c."created_at" AS "createdAt"
    FROM "DocumentConflict" c
    JOIN "Document" a ON a.id = c."documentAId"
    JOIN "Document" b ON b.id = c."documentBId"
    WHERE a."orgId" = ${orgId} AND b."orgId" = ${orgId} AND c.status <> 'dismissed'
      AND ${fromAccess} AND ${toAccess}
    ORDER BY c."created_at" DESC LIMIT ${safeLimit}
  `;
  return [...relationships, ...conflicts].slice(0, Math.max(1, Math.min(250, Number(limit) || 100)));
}
