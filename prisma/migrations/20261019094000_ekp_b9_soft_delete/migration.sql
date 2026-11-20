ALTER TABLE "Document" ADD COLUMN "deletedAt" TIMESTAMP(3), ADD COLUMN "deletedById" TEXT, ADD COLUMN "purgeAfter" TIMESTAMP(3);
CREATE INDEX "Document_deletedAt_idx" ON "Document"("deletedAt");
CREATE INDEX "Document_purgeAfter_idx" ON "Document"("purgeAfter");
