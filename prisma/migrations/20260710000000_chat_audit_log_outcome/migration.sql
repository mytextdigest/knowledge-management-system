-- CKA fast-follow: distinguish denied (org-role gate rejected) chat
-- attempts from answered ones in ChatAuditLog, so the audit log can serve
-- its security-monitoring purpose (spotting access-denied attempts), not
-- just usage tracking of successful queries. Hand-written (not `prisma
-- migrate dev`) per repo convention — shared dev DB has pre-existing drift;
-- apply via `prisma migrate deploy`.

-- AlterTable
ALTER TABLE "ChatAuditLog" ADD COLUMN "outcome" TEXT NOT NULL DEFAULT 'answered';

-- CreateIndex
CREATE INDEX "ChatAuditLog_outcome_idx" ON "ChatAuditLog"("outcome");
