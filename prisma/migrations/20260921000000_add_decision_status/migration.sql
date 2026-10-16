-- Rank 14 — Decision Intelligence Repository (Task 15-B). Purely additive:
-- one new column on an existing table, default "active", no backfill. See
-- REQUIREMENTS_DECISION_INTELLIGENCE_REPOSITORY.md FR-2. Generated via
-- `prisma migrate diff --from-url <live db> --to-schema-datamodel
-- prisma/schema.prisma --script` rather than `prisma migrate dev` (same
-- reset risk as the Lessons Learned migration). One statement from that diff
-- was dropped before applying: `DROP INDEX "public"."Chunk_embedding_vec_idx"`
-- — the same recurring false positive on the `Unsupported("vector(1536)")`
-- pgvector index Prisma's schema DSL can't represent; dropping it would
-- degrade hybrid/related-document search to a full scan.

-- AlterTable
ALTER TABLE "Decision" ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'active';
