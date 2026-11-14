ALTER TABLE "WorkflowDefinition" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'publish';
ALTER TABLE "WorkflowInstance" ADD COLUMN "targetLifecycle" TEXT;
CREATE INDEX "WorkflowDefinition_orgId_kind_active_idx" ON "WorkflowDefinition"("orgId", "kind", "active");
