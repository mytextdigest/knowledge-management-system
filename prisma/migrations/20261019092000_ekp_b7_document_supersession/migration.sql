-- EKP B-7: additive document supersession pointer; preserves all existing documents.
ALTER TABLE "Document" ADD COLUMN "supersededById" TEXT;
CREATE INDEX "Document_supersededById_idx" ON "Document"("supersededById");
ALTER TABLE "Document" ADD CONSTRAINT "Document_supersededById_fkey"
  FOREIGN KEY ("supersededById") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;
