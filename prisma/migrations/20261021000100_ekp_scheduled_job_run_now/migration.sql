-- EKP Workstream A (A-7, F3): "Run now" for scheduled jobs. Purely additive.

-- AlterTable
ALTER TABLE "ScheduledJob" ADD COLUMN     "run_requested_at" TIMESTAMP(3);
