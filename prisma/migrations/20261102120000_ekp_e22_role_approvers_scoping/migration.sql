-- E22.2 role-based stage approvers with any/all, E22.3 department/category scoping.
-- Additive: existing definitions keep approverType 'user' and stay org-wide.
ALTER TABLE "WorkflowDefinition"
 ADD COLUMN "departmentIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
 ADD COLUMN "categories" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "WorkflowStage"
 ADD COLUMN "approverType" TEXT NOT NULL DEFAULT 'user',
 ADD COLUMN "approvalMode" TEXT NOT NULL DEFAULT 'any',
 ALTER COLUMN "approverUserId" DROP NOT NULL;
-- A stage may now have one task per qualifying approver.
DROP INDEX "WorkflowTask_instanceId_stageId_key";
CREATE UNIQUE INDEX "WorkflowTask_instanceId_stageId_assigneeId_key" ON "WorkflowTask"("instanceId", "stageId", "assigneeId");
