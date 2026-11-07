-- EKP Workstream A (A-6): remember what Entra group mapping granted a user,
-- so leaving a group takes back exactly those grants. Purely additive.
-- (migrate diff's false-positive DROP INDEX "Chunk_embedding_vec_idx" removed.)

-- AlterTable
ALTER TABLE "UserIdentity" ADD COLUMN     "group_grants" JSONB;
