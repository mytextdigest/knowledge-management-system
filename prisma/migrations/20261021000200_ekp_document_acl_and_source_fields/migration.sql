-- EKP Workstream A (A-9/A-10, A-11, A-13, A-15): per-file source permissions
-- (DocumentAcl) and Document.external_url / content_type / acl_synced_at.
-- Purely additive. (migrate diff's false-positive DROP INDEX
-- "Chunk_embedding_vec_idx" removed.)


-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "acl_synced_at" TIMESTAMP(3),
ADD COLUMN     "content_type" TEXT NOT NULL DEFAULT 'file',
ADD COLUMN     "external_url" TEXT;

-- CreateTable
CREATE TABLE "DocumentAcl" (
    "id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "principal_type" TEXT NOT NULL,
    "principal_id" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'sharepoint',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentAcl_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DocumentAcl_principal_id_idx" ON "DocumentAcl"("principal_id");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentAcl_document_id_principal_type_principal_id_key" ON "DocumentAcl"("document_id", "principal_type", "principal_id");

-- AddForeignKey
ALTER TABLE "DocumentAcl" ADD CONSTRAINT "DocumentAcl_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;
