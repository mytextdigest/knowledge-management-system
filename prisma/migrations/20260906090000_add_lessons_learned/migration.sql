-- Rank 11 — Lessons Learned Intelligence (Task 12-B). Purely additive: one
-- new table, no existing table altered. Generated via `prisma migrate diff
-- --from-url <live db> --to-schema-datamodel prisma/schema.prisma --script`
-- rather than `prisma migrate dev` (which wanted to reset the dev database
-- over an unrelated pre-existing checksum drift on
-- 20260824004832_add_invite_declined_at — declined, no data loss risked).
-- One statement from that diff was intentionally dropped before applying:
-- `DROP INDEX "public"."Chunk_embedding_vec_idx"` — a false positive, since
-- that ivfflat pgvector index (20260617000000_add_chunk_embedding_vec_index)
-- lives on an `Unsupported("vector(1536)")` column Prisma's schema DSL can't
-- represent, so the diff tool always proposes dropping it. Do not apply that
-- statement; it would degrade hybrid/related-document search to a full scan.

-- CreateTable
CREATE TABLE "Lesson" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "projectId" TEXT,
    "departmentId" TEXT,
    "documentId" TEXT,
    "decisionId" TEXT,
    "topic" TEXT,
    "whatHappened" TEXT NOT NULL,
    "whatWorked" TEXT,
    "whatDidntWork" TEXT,
    "recommendation" TEXT,
    "authorUserId" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lesson_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Lesson_orgId_status_idx" ON "Lesson"("orgId", "status");

-- CreateIndex
CREATE INDEX "Lesson_projectId_idx" ON "Lesson"("projectId");

-- CreateIndex
CREATE INDEX "Lesson_departmentId_idx" ON "Lesson"("departmentId");

-- CreateIndex
CREATE INDEX "Lesson_documentId_idx" ON "Lesson"("documentId");

-- CreateIndex
CREATE INDEX "Lesson_status_idx" ON "Lesson"("status");

-- AddForeignKey
ALTER TABLE "Lesson" ADD CONSTRAINT "Lesson_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lesson" ADD CONSTRAINT "Lesson_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lesson" ADD CONSTRAINT "Lesson_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lesson" ADD CONSTRAINT "Lesson_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lesson" ADD CONSTRAINT "Lesson_decisionId_fkey" FOREIGN KEY ("decisionId") REFERENCES "Decision"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lesson" ADD CONSTRAINT "Lesson_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

