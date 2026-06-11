-- CreateTable
CREATE TABLE "Topic" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "centroidEmbedding" JSONB,
    "keywordDistribution" JSONB,
    "documentCount" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Topic_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TopicDocument" (
    "id" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TopicDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Topic_projectId_idx" ON "Topic"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "TopicDocument_documentId_key" ON "TopicDocument"("documentId");

-- CreateIndex
CREATE INDEX "TopicDocument_topicId_idx" ON "TopicDocument"("topicId");

-- AddForeignKey
ALTER TABLE "Topic" ADD CONSTRAINT "Topic_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TopicDocument" ADD CONSTRAINT "TopicDocument_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TopicDocument" ADD CONSTRAINT "TopicDocument_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;
