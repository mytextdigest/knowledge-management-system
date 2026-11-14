-- Rank 4: Automatic Knowledge Classification
ALTER TABLE "Document"
  ADD COLUMN "categoryConfidence" DOUBLE PRECISION,
  ADD COLUMN "classificationStatus" TEXT NOT NULL DEFAULT 'pending_classification',
  ADD COLUMN "suggestedDepartmentId" TEXT,
  ADD COLUMN "departmentSuggestionConfidence" DOUBLE PRECISION,
  ADD COLUMN "contentHash" TEXT,
  ADD COLUMN "lifecycleSuggestion" TEXT,
  ADD COLUMN "lifecycleSuggestionReason" TEXT,
  ADD COLUMN "lifecycleSuggestedAt" TIMESTAMP(3),
  ADD COLUMN "lifecycleSuggestionDismissedAt" TIMESTAMP(3),
  ADD COLUMN "classifiedAt" TIMESTAMP(3);

CREATE TABLE "DocumentDuplicate" (
  "id" TEXT NOT NULL,
  "documentId" TEXT NOT NULL,
  "duplicateOfId" TEXT NOT NULL,
  "similarity" DOUBLE PRECISION NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DocumentDuplicate_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DocumentDuplicate_documentId_duplicateOfId_key" ON "DocumentDuplicate"("documentId", "duplicateOfId");
CREATE INDEX "DocumentDuplicate_documentId_idx" ON "DocumentDuplicate"("documentId");
CREATE INDEX "DocumentDuplicate_duplicateOfId_idx" ON "DocumentDuplicate"("duplicateOfId");
CREATE INDEX "DocumentDuplicate_status_idx" ON "DocumentDuplicate"("status");
CREATE INDEX "Document_classificationStatus_idx" ON "Document"("classificationStatus");
CREATE INDEX "Document_suggestedDepartmentId_idx" ON "Document"("suggestedDepartmentId");
CREATE INDEX "Document_contentHash_idx" ON "Document"("contentHash");
CREATE INDEX "Document_lifecycleSuggestion_idx" ON "Document"("lifecycleSuggestion");

ALTER TABLE "Document" ADD CONSTRAINT "Document_suggestedDepartmentId_fkey"
  FOREIGN KEY ("suggestedDepartmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DocumentDuplicate" ADD CONSTRAINT "DocumentDuplicate_documentId_fkey"
  FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DocumentDuplicate" ADD CONSTRAINT "DocumentDuplicate_duplicateOfId_fkey"
  FOREIGN KEY ("duplicateOfId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;
