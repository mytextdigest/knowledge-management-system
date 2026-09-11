ALTER TABLE "Topic" ALTER COLUMN "projectId" DROP NOT NULL;
ALTER TABLE "Topic" ADD COLUMN "orgId" TEXT;
ALTER TABLE "Topic" ADD COLUMN "scope" TEXT NOT NULL DEFAULT 'project';
ALTER TABLE "Topic" ADD CONSTRAINT "Topic_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "Topic_orgId_scope_idx" ON "Topic"("orgId", "scope");
CREATE UNIQUE INDEX "Topic_orgId_scope_name_key" ON "Topic"("orgId", "scope", "name");

CREATE TABLE "DocumentRelationship" (
  "id" TEXT NOT NULL, "orgId" TEXT NOT NULL, "fromDocumentId" TEXT NOT NULL, "toDocumentId" TEXT NOT NULL,
  "type" TEXT NOT NULL DEFAULT 'related', "weight" DOUBLE PRECISION NOT NULL, "evidence" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DocumentRelationship_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DocumentRelationship_fromDocumentId_fkey" FOREIGN KEY ("fromDocumentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "DocumentRelationship_toDocumentId_fkey" FOREIGN KEY ("toDocumentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "DocumentRelationship_fromDocumentId_toDocumentId_type_key" ON "DocumentRelationship"("fromDocumentId","toDocumentId","type");
CREATE INDEX "DocumentRelationship_orgId_fromDocumentId_weight_idx" ON "DocumentRelationship"("orgId","fromDocumentId","weight");
CREATE INDEX "DocumentRelationship_orgId_toDocumentId_weight_idx" ON "DocumentRelationship"("orgId","toDocumentId","weight");

CREATE TABLE "DocumentProjectLink" (
  "id" TEXT NOT NULL, "documentId" TEXT NOT NULL, "projectId" TEXT NOT NULL, "confidence" DOUBLE PRECISION NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'suggested', "evidence" TEXT, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DocumentProjectLink_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DocumentProjectLink_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "DocumentProjectLink_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "DocumentProjectLink_documentId_projectId_key" ON "DocumentProjectLink"("documentId","projectId");
CREATE INDEX "DocumentProjectLink_projectId_status_idx" ON "DocumentProjectLink"("projectId","status");
CREATE INDEX "DocumentProjectLink_documentId_status_idx" ON "DocumentProjectLink"("documentId","status");

CREATE TABLE "TopicExpertise" (
  "id" TEXT NOT NULL, "topicId" TEXT NOT NULL, "userId" TEXT NOT NULL, "score" DOUBLE PRECISION NOT NULL, "signals" JSONB,
  "updated_at" TIMESTAMP(3) NOT NULL, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TopicExpertise_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TopicExpertise_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "TopicExpertise_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "TopicExpertise_topicId_userId_key" ON "TopicExpertise"("topicId","userId");
CREATE INDEX "TopicExpertise_topicId_score_idx" ON "TopicExpertise"("topicId","score");
CREATE INDEX "TopicExpertise_userId_idx" ON "TopicExpertise"("userId");
