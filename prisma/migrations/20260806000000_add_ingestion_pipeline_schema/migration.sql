-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "external_id" TEXT,
ADD COLUMN     "external_modified_at" TIMESTAMP(3),
ADD COLUMN     "source_provider" TEXT DEFAULT 'manual';

-- CreateTable
CREATE TABLE "OrgIntegration" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'connected',
    "scope_config" JSONB NOT NULL,
    "access_token" TEXT NOT NULL,
    "refresh_token" TEXT NOT NULL,
    "token_expiry" TIMESTAMP(3) NOT NULL,
    "last_sync_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrgIntegration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncRun" (
    "id" TEXT NOT NULL,
    "integration_id" TEXT NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'running',
    "files_found" INTEGER NOT NULL DEFAULT 0,
    "files_failed" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,

    CONSTRAINT "SyncRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OrgIntegration_orgId_idx" ON "OrgIntegration"("orgId");

-- CreateIndex
CREATE INDEX "OrgIntegration_orgId_provider_idx" ON "OrgIntegration"("orgId", "provider");

-- CreateIndex
CREATE INDEX "SyncRun_integration_id_idx" ON "SyncRun"("integration_id");

-- CreateIndex
CREATE INDEX "SyncRun_status_idx" ON "SyncRun"("status");

-- CreateIndex
CREATE INDEX "Document_source_provider_external_id_idx" ON "Document"("source_provider", "external_id");

-- AddForeignKey
ALTER TABLE "OrgIntegration" ADD CONSTRAINT "OrgIntegration_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncRun" ADD CONSTRAINT "SyncRun_integration_id_fkey" FOREIGN KEY ("integration_id") REFERENCES "OrgIntegration"("id") ON DELETE CASCADE ON UPDATE CASCADE;
