-- Additive only. The "DROP INDEX Chunk_embedding_vec_idx" line `prisma migrate
-- diff` generates here is a known false positive (that pgvector index is
-- created via raw SQL, not represented in schema.prisma, so diff always
-- wants to drop it) - stripped per this project's established migration
-- review practice; never apply it.

-- AlterTable
ALTER TABLE "DocumentInteraction" ADD COLUMN "durationSeconds" INTEGER;
