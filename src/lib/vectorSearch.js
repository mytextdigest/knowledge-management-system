import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

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

export async function orgSearch(queryEmbedding, { userId, orgId, limit = 8 }) {
  const embStr = JSON.stringify(queryEmbedding);
  return prisma.$queryRaw`
    SELECT c.id, c.text, c.summary, c.chunk_index, c.document_id, c.metadata,
           d.filename, d."orgId", d."departmentId", d.scope,
           (c.embedding_vec <=> ${embStr}::vector) AS distance
    FROM "Chunk" c
    JOIN "Document" d ON c.document_id = d.id
    LEFT JOIN "DepartmentMember" dm
      ON d."departmentId" = dm."departmentId" AND dm."userId" = ${userId}
    WHERE d."orgId" = ${orgId}
      AND c.embedding_vec IS NOT NULL
      AND (
        (d.scope = 'repository'
         AND d.lifecycle = 'published'
         AND (d."departmentId" IS NULL OR dm."userId" IS NOT NULL))
        OR
        EXISTS (
          SELECT 1 FROM "Project" p
          WHERE p.id = d."projectId"
            AND p.scope = 'org'
            AND p."orgId" = ${orgId}
        )
      )
    ORDER BY distance ASC
    LIMIT ${Prisma.raw(String(limit))}
  `;
}
