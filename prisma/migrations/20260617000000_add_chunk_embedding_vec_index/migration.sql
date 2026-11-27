-- Approximate-nearest-neighbor index for org-wide and project-wide pgvector
-- search (Task 3-A). Without this, every <=> query is a full sequential scan,
-- which is fine for the current data volume but won't hold up once the
-- repository grows to 1000+ documents as called out in the plan's acceptance
-- criteria. ivfflat is used (rather than hnsw) for broader pgvector version
-- compatibility; lists=100 is a reasonable starting point and should be
-- retuned (roughly sqrt(row_count)) once real chunk volume is known.
CREATE INDEX IF NOT EXISTS "Chunk_embedding_vec_idx"
  ON "Chunk" USING ivfflat (embedding_vec vector_cosine_ops)
  WITH (lists = 100);

ANALYZE "Chunk";
