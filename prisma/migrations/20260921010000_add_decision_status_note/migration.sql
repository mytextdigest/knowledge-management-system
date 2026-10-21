-- Rank 14 — Decision Intelligence Repository. Purely additive: a nullable
-- free-text column accompanying Decision.status, no backfill. See
-- REQUIREMENTS_DECISION_INTELLIGENCE_REPOSITORY.md FR-2. Generated via
-- `prisma migrate diff --from-url <live db> --to-schema-datamodel
-- prisma/schema.prisma --script`. One statement from that diff was dropped
-- before applying: `DROP INDEX "public"."Chunk_embedding_vec_idx"` — the
-- same recurring false positive on the `Unsupported("vector(1536)")`
-- pgvector index Prisma's schema DSL can't represent; dropping it would
-- degrade hybrid/related-document search to a full scan.

-- AlterTable
ALTER TABLE "Decision" ADD COLUMN     "statusNote" TEXT;
