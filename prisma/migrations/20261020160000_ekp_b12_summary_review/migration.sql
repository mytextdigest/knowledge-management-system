CREATE TABLE "DocumentSummaryReview" (
 "id" TEXT NOT NULL, "documentId" TEXT NOT NULL, "orgId" TEXT NOT NULL,
 "status" TEXT NOT NULL DEFAULT 'pending', "summaryHash" TEXT NOT NULL,
 "reviewedById" TEXT, "reviewedAt" TIMESTAMP(3),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "DocumentSummaryReview_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DocumentSummaryReview_documentId_key" ON "DocumentSummaryReview"("documentId");
CREATE INDEX "DocumentSummaryReview_orgId_status_idx" ON "DocumentSummaryReview"("orgId", "status");
ALTER TABLE "DocumentSummaryReview" ADD CONSTRAINT "DocumentSummaryReview_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DocumentSummaryReview" ADD CONSTRAINT "DocumentSummaryReview_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DocumentSummaryReview" ADD CONSTRAINT "DocumentSummaryReview_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
