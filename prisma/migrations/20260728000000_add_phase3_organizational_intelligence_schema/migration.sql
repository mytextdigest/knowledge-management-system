-- Rank 1 Phase 3 (Organizational Intelligence Agent), Task 6-A: shared schema
-- for Decision Intelligence/Knowledge Health Monitoring (6-B), Predictive/
-- Proactive Recommendations (6-C), and Organizational Learning/Workflow
-- Assistance (6-D).
-- Hand-written (not `prisma migrate dev`) because the shared dev DB has
-- pre-existing drift; apply via `prisma migrate deploy` per repo convention
-- (see Task 4-A's migration note).

-- AlterTable
ALTER TABLE "OrgMessage" ADD COLUMN "feedback" TEXT;

-- AlterTable
ALTER TABLE "OrgConversation" ADD COLUMN "activeWorkflowDocumentId" TEXT,
ADD COLUMN "activeWorkflowStep" INTEGER;

-- CreateTable
CREATE TABLE "KnowledgeGap" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "gapScore" DOUBLE PRECISION NOT NULL,
    "occurrenceCount" INTEGER NOT NULL,
    "zeroCitationCount" INTEGER NOT NULL,
    "lowConfidenceCount" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KnowledgeGap_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "KnowledgeGap_orgId_idx" ON "KnowledgeGap"("orgId");

-- CreateIndex
CREATE INDEX "KnowledgeGap_orgId_gapScore_idx" ON "KnowledgeGap"("orgId", "gapScore");

-- CreateIndex
CREATE INDEX "KnowledgeGap_created_at_idx" ON "KnowledgeGap"("created_at");

-- AddForeignKey
ALTER TABLE "KnowledgeGap" ADD CONSTRAINT "KnowledgeGap_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
