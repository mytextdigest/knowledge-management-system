-- CKA Task 4-A: session memory + persisted citations/confidence on Org Chat,
-- plus a minimal audit log of every chat query. Hand-written (not `prisma
-- migrate dev`) because the shared dev DB has pre-existing drift; apply via
-- `prisma migrate deploy` per repo convention (see IMPLEMENTATION_TRACKER.md
-- Task 1-A/3-B notes).

-- AlterTable
ALTER TABLE "OrgConversation" ADD COLUMN     "activeDocumentId" TEXT,
ADD COLUMN     "activeTopic" TEXT;

-- AlterTable
ALTER TABLE "OrgMessage" ADD COLUMN     "confidence" TEXT,
ADD COLUMN     "sources" JSONB;

-- CreateTable
CREATE TABLE "ChatAuditLog" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "citedDocIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChatAuditLog_orgId_idx" ON "ChatAuditLog"("orgId");

-- CreateIndex
CREATE INDEX "ChatAuditLog_userId_idx" ON "ChatAuditLog"("userId");

-- CreateIndex
CREATE INDEX "ChatAuditLog_created_at_idx" ON "ChatAuditLog"("created_at");

-- AddForeignKey
ALTER TABLE "ChatAuditLog" ADD CONSTRAINT "ChatAuditLog_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatAuditLog" ADD CONSTRAINT "ChatAuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
