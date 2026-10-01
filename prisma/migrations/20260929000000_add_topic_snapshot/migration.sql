-- Rank 16 — Topic Evolution Tracking (Milestone 17, Task 17-B)
-- Purely additive: one new table, no changes to Topic/TopicDocument/Organization columns.

-- CreateTable
CREATE TABLE "TopicSnapshot" (
    "id" TEXT NOT NULL,
    "topicRef" TEXT NOT NULL,
    "topicId" TEXT,
    "topicName" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "period_start" TIMESTAMP(3) NOT NULL,
    "captured_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "document_count" INTEGER NOT NULL,
    "expert_count" INTEGER NOT NULL DEFAULT 0,
    "keyword_summary" JSONB,
    "department_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "has_unrestricted_doc" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "TopicSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TopicSnapshot_topicRef_captured_at_idx" ON "TopicSnapshot"("topicRef", "captured_at");

-- CreateIndex
CREATE INDEX "TopicSnapshot_orgId_scope_captured_at_idx" ON "TopicSnapshot"("orgId", "scope", "captured_at");

-- CreateIndex
CREATE UNIQUE INDEX "TopicSnapshot_topicRef_period_start_key" ON "TopicSnapshot"("topicRef", "period_start");

-- AddForeignKey
ALTER TABLE "TopicSnapshot" ADD CONSTRAINT "TopicSnapshot_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TopicSnapshot" ADD CONSTRAINT "TopicSnapshot_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
