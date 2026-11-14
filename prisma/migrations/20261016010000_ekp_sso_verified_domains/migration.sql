-- EKP Workstream A (A-5): remember the connected tenant's name and verified
-- domains so the admin page can only offer domains the tenant owns.
-- Purely additive. (migrate diff's false-positive DROP INDEX "Chunk_embedding_vec_idx" removed.)

-- AlterTable
ALTER TABLE "OrgSsoConfig" ADD COLUMN     "tenant_name" TEXT,
ADD COLUMN     "verified_domains" TEXT[] DEFAULT ARRAY[]::TEXT[];
