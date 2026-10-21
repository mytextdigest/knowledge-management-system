-- EKP Workstream A (A-7, F3): scheduled jobs table, and SyncRun.trigger
-- ("manual" | "scheduled"). Purely additive. (migrate diff's false-positive
-- DROP INDEX "Chunk_embedding_vec_idx" removed.)


-- AlterTable
ALTER TABLE "SyncRun" ADD COLUMN     "trigger" TEXT NOT NULL DEFAULT 'manual';

-- CreateTable
CREATE TABLE "ScheduledJob" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "orgId" TEXT,
    "interval_minutes" INTEGER NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "next_run_at" TIMESTAMP(3) NOT NULL,
    "last_run_at" TIMESTAMP(3),
    "last_status" TEXT,
    "last_error" TEXT,
    "last_duration_ms" INTEGER,
    "last_result" JSONB,
    "locked_until" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScheduledJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ScheduledJob_key_key" ON "ScheduledJob"("key");

-- CreateIndex
CREATE INDEX "ScheduledJob_enabled_next_run_at_idx" ON "ScheduledJob"("enabled", "next_run_at");

-- CreateIndex
CREATE INDEX "ScheduledJob_orgId_idx" ON "ScheduledJob"("orgId");

-- AddForeignKey
ALTER TABLE "ScheduledJob" ADD CONSTRAINT "ScheduledJob_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

