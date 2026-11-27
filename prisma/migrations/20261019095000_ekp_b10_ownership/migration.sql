-- B-10 additive ownership schema; NO automated backfill and NO database execution.
ALTER TABLE "Document" ADD COLUMN "ownerId" TEXT;
ALTER TABLE "Department" ADD COLUMN "defaultOwnerId" TEXT;
CREATE TABLE "DocumentSteward" ("documentId" TEXT NOT NULL, "userId" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "DocumentSteward_pkey" PRIMARY KEY ("documentId","userId"));
CREATE INDEX "Document_ownerId_idx" ON "Document"("ownerId");
CREATE INDEX "DocumentSteward_userId_idx" ON "DocumentSteward"("userId");
ALTER TABLE "Document" ADD CONSTRAINT "Document_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Department" ADD CONSTRAINT "Department_defaultOwnerId_fkey" FOREIGN KEY ("defaultOwnerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DocumentSteward" ADD CONSTRAINT "DocumentSteward_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DocumentSteward" ADD CONSTRAINT "DocumentSteward_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
