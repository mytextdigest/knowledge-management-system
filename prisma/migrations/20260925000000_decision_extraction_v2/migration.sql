-- AlterTable
ALTER TABLE "Decision" ADD COLUMN     "actors" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "aiStatement" TEXT,
ADD COLUMN     "alternatives" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "certainty" TEXT,
ADD COLUMN     "explicitness" TEXT,
ADD COLUMN     "reviewNote" TEXT,
ADD COLUMN     "reviewedAt" TIMESTAMP(3),
ADD COLUMN     "reviewedById" TEXT,
ADD COLUMN     "score" INTEGER,
ADD COLUMN     "signals" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'extracted',
ADD COLUMN     "subject" TEXT;

-- CreateTable
CREATE TABLE "DecisionEvidence" (
    "id" TEXT NOT NULL,
    "decisionId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "chunkId" TEXT,
    "chunkIndex" INTEGER,
    "quote" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DecisionEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DecisionEvidence_decisionId_idx" ON "DecisionEvidence"("decisionId");

-- CreateIndex
CREATE INDEX "DecisionEvidence_documentId_idx" ON "DecisionEvidence"("documentId");

-- CreateIndex
CREATE INDEX "Decision_status_idx" ON "Decision"("status");

-- AddForeignKey
ALTER TABLE "Decision" ADD CONSTRAINT "Decision_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DecisionEvidence" ADD CONSTRAINT "DecisionEvidence_decisionId_fkey" FOREIGN KEY ("decisionId") REFERENCES "Decision"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DecisionEvidence" ADD CONSTRAINT "DecisionEvidence_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DecisionEvidence" ADD CONSTRAINT "DecisionEvidence_chunkId_fkey" FOREIGN KEY ("chunkId") REFERENCES "Chunk"("id") ON DELETE SET NULL ON UPDATE CASCADE;
