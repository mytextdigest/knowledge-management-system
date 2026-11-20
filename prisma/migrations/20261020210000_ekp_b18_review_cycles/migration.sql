ALTER TABLE "Document" ADD COLUMN "nextReviewAt" TIMESTAMP(3), ADD COLUMN "lastReviewedAt" TIMESTAMP(3);
CREATE TABLE "ReviewPolicy" (
 "id" TEXT NOT NULL, "orgId" TEXT NOT NULL, "name" TEXT NOT NULL,
 "intervalDays" INTEGER NOT NULL, "reviewerType" TEXT NOT NULL DEFAULT 'owner',
 "escalateAfterDays" INTEGER NOT NULL DEFAULT 7,
 "departmentIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[], "categories" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
 "active" BOOLEAN NOT NULL DEFAULT true, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "ReviewPolicy_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "ReviewRecord" (
 "id" TEXT NOT NULL, "orgId" TEXT NOT NULL, "documentId" TEXT NOT NULL,
 "policyId" TEXT NOT NULL, "reviewerId" TEXT NOT NULL,
 "status" TEXT NOT NULL DEFAULT 'pending', "dueAt" TIMESTAMP(3) NOT NULL,
 "escalatedAt" TIMESTAMP(3), "completedAt" TIMESTAMP(3), "note" TEXT,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "ReviewRecord_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ReviewPolicy_orgId_name_key" ON "ReviewPolicy"("orgId","name");
CREATE INDEX "ReviewPolicy_orgId_active_idx" ON "ReviewPolicy"("orgId","active");
CREATE INDEX "ReviewRecord_orgId_status_dueAt_idx" ON "ReviewRecord"("orgId","status","dueAt");
CREATE INDEX "ReviewRecord_reviewerId_status_idx" ON "ReviewRecord"("reviewerId","status");
CREATE INDEX "ReviewRecord_documentId_status_idx" ON "ReviewRecord"("documentId","status");
ALTER TABLE "ReviewPolicy" ADD CONSTRAINT "ReviewPolicy_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReviewRecord" ADD CONSTRAINT "ReviewRecord_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReviewRecord" ADD CONSTRAINT "ReviewRecord_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReviewRecord" ADD CONSTRAINT "ReviewRecord_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "ReviewPolicy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ReviewRecord"
ADD CONSTRAINT "ReviewRecord_reviewerId_fkey"
FOREIGN KEY ("reviewerId")
REFERENCES "User"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;