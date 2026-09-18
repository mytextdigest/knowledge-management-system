-- DropIndex
DROP INDEX "public"."OrgIntegration_orgId_provider_idx";

-- CreateIndex
CREATE UNIQUE INDEX "OrgIntegration_orgId_provider_key" ON "OrgIntegration"("orgId", "provider");
