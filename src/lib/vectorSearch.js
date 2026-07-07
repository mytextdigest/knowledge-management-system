import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

function scopeSql({ scope = "organization", departmentId = null }) {
  if (scope === "department") {
    if (departmentId) {
      return Prisma.sql`AND d."departmentId" = ${departmentId}`;
    }

    return Prisma.sql`AND d."departmentId" IS NOT NULL`;
  }

  if (scope === "personal") {
    return Prisma.sql`AND d.scope = 'private'`;
  }

  return Prisma.empty;
}

export async function similaritySearch(queryEmbedding, { projectId, limit = 8 }) {
  const embStr = JSON.stringify(queryEmbedding);

  return prisma.$queryRaw`
    SELECT c.id, c.text, c.summary, c.chunk_index, c.document_id, c.metadata,
           (c.embedding_vec <=> ${embStr}::vector) AS distance
    FROM "Chunk" c
    JOIN "Document" d ON c.document_id = d.id
    WHERE d."projectId" = ${projectId}
      AND c.embedding_vec IS NOT NULL
    ORDER BY distance ASC
    LIMIT ${Prisma.raw(String(limit))}
  `;
}

export async function orgSearch(
  queryEmbedding,
  {
    userId,
    orgId,
    limit = 8,
    isSuperAdmin = false,
    scope = "organization",
    departmentId = null,
  }
) {
  const embStr = JSON.stringify(queryEmbedding);
  const scopeFilter = scopeSql({ scope, departmentId });

  return prisma.$queryRaw`
    SELECT c.id, c.text, c.summary, c.chunk_index, c.document_id, c.metadata,
           d.filename, d.file_path AS "filePath", d."orgId", d."departmentId", d."projectId", d.scope, d.category,
           dept.name AS department_name,
           proj.name AS project_name,
           (c.embedding_vec <=> ${embStr}::vector) AS distance,
           0::float AS keyword_score
    FROM "Chunk" c
    JOIN "Document" d ON c.document_id = d.id
    LEFT JOIN "Department" dept ON dept.id = d."departmentId"
    LEFT JOIN "Project" proj ON proj.id = d."projectId"
    LEFT JOIN "DepartmentMember" dm
      ON d."departmentId" = dm."departmentId" AND dm."userId" = ${userId}
    WHERE d."orgId" = ${orgId}
      AND c.embedding_vec IS NOT NULL
      ${scopeFilter}
      AND (
        (d.scope = 'repository'
         AND (${isSuperAdmin} OR d."departmentId" IS NULL OR dm."userId" IS NOT NULL))
        OR
        EXISTS (
          SELECT 1 FROM "Project" p
          WHERE p.id = d."projectId"
            AND p.scope = 'org'
            AND p."orgId" = ${orgId}
            AND (
              ${isSuperAdmin}
              OR EXISTS (
                SELECT 1 FROM "DepartmentMember" pm
                WHERE pm."departmentId" = p."departmentId" AND pm."userId" = ${userId}
              )
            )
        )
      )
    ORDER BY distance ASC
    LIMIT ${Prisma.raw(String(limit))}
  `;
}

export async function orgKeywordSearch(
  query,
  {
    userId,
    orgId,
    limit = 8,
    isSuperAdmin = false,
    scope = "organization",
    departmentId = null,
  }
) {
  const safeQuery = String(query || "").trim();
  const scopeFilter = scopeSql({ scope, departmentId });

  if (!safeQuery) return [];

  return prisma.$queryRaw`
    SELECT c.id, c.text, c.summary, c.chunk_index, c.document_id, c.metadata,
           d.filename, d.file_path AS "filePath", d."orgId", d."departmentId", d."projectId", d.scope, d.category,
           dept.name AS department_name,
           proj.name AS project_name,
           1::float AS distance,
           ts_rank_cd(
             to_tsvector('english', coalesce(c.text, '') || ' ' || coalesce(c.summary, '') || ' ' || coalesce(d.filename, '')),
             plainto_tsquery('english', ${safeQuery})
           )::float AS keyword_score
    FROM "Chunk" c
    JOIN "Document" d ON c.document_id = d.id
    LEFT JOIN "Department" dept ON dept.id = d."departmentId"
    LEFT JOIN "Project" proj ON proj.id = d."projectId"
    LEFT JOIN "DepartmentMember" dm
      ON d."departmentId" = dm."departmentId" AND dm."userId" = ${userId}
    WHERE d."orgId" = ${orgId}
      ${scopeFilter}
      AND to_tsvector('english', coalesce(c.text, '') || ' ' || coalesce(c.summary, '') || ' ' || coalesce(d.filename, ''))
          @@ plainto_tsquery('english', ${safeQuery})
      AND (
        (d.scope = 'repository'
         AND (${isSuperAdmin} OR d."departmentId" IS NULL OR dm."userId" IS NOT NULL))
        OR
        EXISTS (
          SELECT 1 FROM "Project" p
          WHERE p.id = d."projectId"
            AND p.scope = 'org'
            AND p."orgId" = ${orgId}
            AND (
              ${isSuperAdmin}
              OR EXISTS (
                SELECT 1 FROM "DepartmentMember" pm
                WHERE pm."departmentId" = p."departmentId" AND pm."userId" = ${userId}
              )
            )
        )
      )
    ORDER BY keyword_score DESC
    LIMIT ${Prisma.raw(String(limit))}
  `;
}
export async function orgFallbackTextSearch(
  query,
  {
    userId,
    orgId,
    limit = 8,
    isSuperAdmin = false,
    scope = "organization",
    departmentId = null,
  }
) {
  const safeQuery = String(query || "").trim();
  const terms = safeQuery
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3)
    .slice(0, 6);

  if (terms.length === 0) return [];

  const scopeFilter = scopeSql({ scope, departmentId });

  const termFilters = terms.map(
    (term) => Prisma.sql`
      (
        c.text ILIKE ${`%${term}%`}
        OR c.summary ILIKE ${`%${term}%`}
        OR d.filename ILIKE ${`%${term}%`}
      )
    `
  );

  return prisma.$queryRaw`
    SELECT c.id, c.text, c.summary, c.chunk_index, c.document_id, c.metadata,
           d.filename, d.file_path AS "filePath", d."orgId", d."departmentId", d."projectId", d.scope, d.category,
           dept.name AS department_name,
           proj.name AS project_name,
           1::float AS distance,
           0.5::float AS keyword_score
    FROM "Chunk" c
    JOIN "Document" d ON c.document_id = d.id
    LEFT JOIN "Department" dept ON dept.id = d."departmentId"
    LEFT JOIN "Project" proj ON proj.id = d."projectId"
    LEFT JOIN "DepartmentMember" dm
      ON d."departmentId" = dm."departmentId" AND dm."userId" = ${userId}
    WHERE d."orgId" = ${orgId}
      ${scopeFilter}
      AND (${Prisma.join(termFilters, " OR ")})
      AND (
        (d.scope = 'repository'
         AND (${isSuperAdmin} OR d."departmentId" IS NULL OR dm."userId" IS NOT NULL))
        OR
        EXISTS (
          SELECT 1 FROM "Project" p
          WHERE p.id = d."projectId"
            AND p.scope = 'org'
            AND p."orgId" = ${orgId}
            AND (
              ${isSuperAdmin}
              OR EXISTS (
                SELECT 1 FROM "DepartmentMember" pm
                WHERE pm."departmentId" = p."departmentId" AND pm."userId" = ${userId}
              )
            )
        )
      )
    LIMIT ${Prisma.raw(String(limit))}
  `;
}