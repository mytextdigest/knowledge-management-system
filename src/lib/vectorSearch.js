import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { computeBM25, tokenize } from "@/lib/keywordSearch";

export function scopeSql({ scope = "organization", departmentId = null, userId = null }) {
  if (scope === "department") {
    if (departmentId) {
      // A document's department can come directly (repository-scoped docs)
      // or only via its project (project-scoped docs have Document.departmentId
      // = null; the department lives on Project.departmentId instead) — match
      // both, or every project-scoped document silently vanishes from
      // department-scoped search/recommendations/decision-evidence.
      return Prisma.sql`AND (
        d."departmentId" = ${departmentId}
        OR EXISTS (
          SELECT 1 FROM "Project" scope_proj
          WHERE scope_proj.id = d."projectId" AND scope_proj."departmentId" = ${departmentId}
        )
      )`;
    }

    // No specific department chosen (e.g. the requester belongs to none) —
    // restrict to departments they're actually a member of via the `dm`
    // join already present in every caller's WHERE clause, not every
    // department in the org. isSuperAdmin does NOT bypass this: "Department"
    // scope is a narrowing choice, and narrowing to a department you're not
    // in must never silently widen to "all departments." Same
    // direct-or-via-project reasoning as above applies to this membership
    // check too.
    return Prisma.sql`AND (
      (d."departmentId" IS NOT NULL AND dm."userId" IS NOT NULL)
      OR EXISTS (
        SELECT 1 FROM "Project" scope_proj
        JOIN "DepartmentMember" scope_pm
          ON scope_pm."departmentId" = scope_proj."departmentId" AND scope_pm."userId" = ${userId}
        WHERE scope_proj.id = d."projectId"
      )
    )`;
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
  const scopeFilter = scopeSql({ scope, departmentId, userId });

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
         AND d.lifecycle = 'published'
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
  if (!safeQuery) return [];

  const terms = tokenize(safeQuery).slice(0, 8);
  if (terms.length === 0) return [];

  const scopeFilter = scopeSql({ scope, departmentId, userId });
  const termFilters = terms.map(
    (term) => Prisma.sql`
      (
        c.text ILIKE ${`%${term}%`}
        OR c.summary ILIKE ${`%${term}%`}
        OR d.filename ILIKE ${`%${term}%`}
      )
    `
  );

  // Bounded candidate pool (RBAC/scope-filtered) for computeBM25 to rank in
  // memory, rather than scoring the entire org corpus per query.
  const candidatePoolSize = Math.max(limit * 15, 150);

  const candidates = await prisma.$queryRaw`
    SELECT c.id, c.text, c.summary, c.chunk_index, c.document_id, c.metadata,
           d.filename, d.file_path AS "filePath", d."orgId", d."departmentId", d."projectId", d.scope, d.category,
           dept.name AS department_name,
           proj.name AS project_name
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
         AND d.lifecycle = 'published'
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
    LIMIT ${Prisma.raw(String(candidatePoolSize))}
  `;

  if (candidates.length === 0) return [];

  return computeBM25(candidates, safeQuery)
    .filter((c) => c.score > 0)
    .slice(0, limit)
    .map((c) => ({ ...c, distance: 1, keyword_score: c.score }));
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

  const scopeFilter = scopeSql({ scope, departmentId, userId });

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
         AND d.lifecycle = 'published'
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
