ALTER TABLE "TopicExpertise"
  ADD COLUMN "source" TEXT NOT NULL DEFAULT 'inferred',
  ADD COLUMN "confirmedBy" TEXT,
  ADD COLUMN "lastSignalAt" TIMESTAMP(3);

CREATE TABLE "DocumentInteraction" (
  "id" TEXT NOT NULL,
  "documentId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "orgId" TEXT NOT NULL,
  "type" TEXT NOT NULL DEFAULT 'view',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DocumentInteraction_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DocumentInteraction_documentId_type_idx" ON "DocumentInteraction"("documentId", "type");
CREATE INDEX "DocumentInteraction_userId_created_at_idx" ON "DocumentInteraction"("userId", "created_at");
CREATE INDEX "DocumentInteraction_orgId_created_at_idx" ON "DocumentInteraction"("orgId", "created_at");

ALTER TABLE "DocumentInteraction" ADD CONSTRAINT "DocumentInteraction_documentId_fkey"
  FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DocumentInteraction" ADD CONSTRAINT "DocumentInteraction_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DocumentInteraction" ADD CONSTRAINT "DocumentInteraction_orgId_fkey"
  FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
