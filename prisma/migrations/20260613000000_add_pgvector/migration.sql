-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Add vector embedding column to Chunk
ALTER TABLE "Chunk" ADD COLUMN "embedding_vec" vector(1536);

-- Add document_id index for vector similarity lookups
CREATE INDEX "Chunk_document_id_idx" ON "Chunk"("document_id");
