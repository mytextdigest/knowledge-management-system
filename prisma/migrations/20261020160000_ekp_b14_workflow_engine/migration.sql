-- B-14 additive migration. Do not apply until existing Neon migration history is reconciled.
CREATE TABLE "WorkflowDefinition" ("id" TEXT NOT NULL, "orgId" TEXT NOT NULL, "name" TEXT NOT NULL, "active" BOOLEAN NOT NULL DEFAULT true, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "WorkflowDefinition_pkey" PRIMARY KEY ("id"));
CREATE TABLE "WorkflowStage" ("id" TEXT NOT NULL, "definitionId" TEXT NOT NULL, "position" INTEGER NOT NULL, "name" TEXT NOT NULL, "approverUserId" TEXT NOT NULL, CONSTRAINT "WorkflowStage_pkey" PRIMARY KEY ("id"));
CREATE TABLE "WorkflowInstance" ("id" TEXT NOT NULL, "orgId" TEXT NOT NULL, "documentId" TEXT NOT NULL, "definitionId" TEXT NOT NULL, "submittedById" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'in_review', "currentPosition" INTEGER NOT NULL DEFAULT 1, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "WorkflowInstance_pkey" PRIMARY KEY ("id"));
CREATE TABLE "WorkflowTask" ("id" TEXT NOT NULL, "instanceId" TEXT NOT NULL, "stageId" TEXT NOT NULL, "assigneeId" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'pending', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "decidedAt" TIMESTAMP(3), CONSTRAINT "WorkflowTask_pkey" PRIMARY KEY ("id"));
CREATE TABLE "WorkflowDecision" ("id" TEXT NOT NULL, "instanceId" TEXT NOT NULL, "taskId" TEXT NOT NULL, "actorId" TEXT NOT NULL, "action" TEXT NOT NULL, "comment" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "WorkflowDecision_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "WorkflowDefinition_orgId_name_key" ON "WorkflowDefinition"("orgId", "name");
CREATE INDEX "WorkflowDefinition_orgId_active_idx" ON "WorkflowDefinition"("orgId", "active");
CREATE UNIQUE INDEX "WorkflowStage_definitionId_position_key" ON "WorkflowStage"("definitionId", "position");
CREATE INDEX "WorkflowInstance_orgId_status_idx" ON "WorkflowInstance"("orgId", "status");
CREATE INDEX "WorkflowInstance_documentId_status_idx" ON "WorkflowInstance"("documentId", "status");
CREATE UNIQUE INDEX "WorkflowTask_instanceId_stageId_key" ON "WorkflowTask"("instanceId", "stageId");
CREATE INDEX "WorkflowTask_assigneeId_status_idx" ON "WorkflowTask"("assigneeId", "status");
CREATE UNIQUE INDEX "WorkflowDecision_taskId_key" ON "WorkflowDecision"("taskId");
ALTER TABLE "WorkflowDefinition" ADD CONSTRAINT "WorkflowDefinition_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkflowStage" ADD CONSTRAINT "WorkflowStage_definitionId_fkey" FOREIGN KEY ("definitionId") REFERENCES "WorkflowDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkflowInstance" ADD CONSTRAINT "WorkflowInstance_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkflowInstance" ADD CONSTRAINT "WorkflowInstance_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkflowInstance" ADD CONSTRAINT "WorkflowInstance_definitionId_fkey" FOREIGN KEY ("definitionId") REFERENCES "WorkflowDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WorkflowInstance" ADD CONSTRAINT "WorkflowInstance_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WorkflowTask" ADD CONSTRAINT "WorkflowTask_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "WorkflowInstance"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkflowTask" ADD CONSTRAINT "WorkflowTask_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "WorkflowStage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WorkflowTask" ADD CONSTRAINT "WorkflowTask_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WorkflowDecision" ADD CONSTRAINT "WorkflowDecision_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "WorkflowInstance"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkflowDecision" ADD CONSTRAINT "WorkflowDecision_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX "WorkflowInstance_one_active_document" ON "WorkflowInstance"("documentId") WHERE "status" = 'in_review';

ALTER TABLE "WorkflowDecision"
ADD CONSTRAINT "WorkflowDecision_taskId_fkey"
FOREIGN KEY ("taskId")
REFERENCES "WorkflowTask"("id")
ON DELETE CASCADE ON UPDATE CASCADE;