-- Rank 1 Phase 2 (Knowledge Understanding), Task 5-A: shared schema for
-- Entity Extraction/Organizational Memory (5-B), Decision Tracking/Timeline
-- Generation (5-C), and Cross-Project Synthesis/Conflict Detection (5-D).
-- Hand-written (not `prisma migrate dev`) because the shared dev DB has
-- pre-existing drift; apply via `prisma migrate deploy` per repo convention
-- (see Task 4-A's migration note).

-- CreateTable
CREATE TABLE "Entity" (
    "id" TEXT NOT NULL,
    "documentId" TEXT,
    "conversationId" TEXT,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Entity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Entity_documentId_idx" ON "Entity"("documentId");

-- CreateIndex
CREATE INDEX "Entity_conversationId_idx" ON "Entity"("conversationId");

-- CreateIndex
CREATE INDEX "Entity_type_idx" ON "Entity"("type");

-- AddForeignKey
ALTER TABLE "Entity" ADD CONSTRAINT "Entity_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Entity" ADD CONSTRAINT "Entity_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "OrgConversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "Decision" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "statement" TEXT NOT NULL,
    "rationale" TEXT,
    "decidedAt" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Decision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Decision_documentId_idx" ON "Decision"("documentId");

-- AddForeignKey
ALTER TABLE "Decision" ADD CONSTRAINT "Decision_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "TimelineEvent" (
    "id" TEXT NOT NULL,
    "projectId" TEXT,
    "departmentId" TEXT,
    "documentId" TEXT,
    "decisionId" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "description" TEXT NOT NULL,

    CONSTRAINT "TimelineEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TimelineEvent_projectId_idx" ON "TimelineEvent"("projectId");

-- CreateIndex
CREATE INDEX "TimelineEvent_departmentId_idx" ON "TimelineEvent"("departmentId");

-- CreateIndex
CREATE INDEX "TimelineEvent_documentId_idx" ON "TimelineEvent"("documentId");

-- CreateIndex
CREATE INDEX "TimelineEvent_occurredAt_idx" ON "TimelineEvent"("occurredAt");

-- AddForeignKey
ALTER TABLE "TimelineEvent" ADD CONSTRAINT "TimelineEvent_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimelineEvent" ADD CONSTRAINT "TimelineEvent_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimelineEvent" ADD CONSTRAINT "TimelineEvent_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimelineEvent" ADD CONSTRAINT "TimelineEvent_decisionId_fkey" FOREIGN KEY ("decisionId") REFERENCES "Decision"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "DocumentConflict" (
    "id" TEXT NOT NULL,
    "documentAId" TEXT NOT NULL,
    "documentBId" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'flagged',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentConflict_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DocumentConflict_documentAId_idx" ON "DocumentConflict"("documentAId");

-- CreateIndex
CREATE INDEX "DocumentConflict_documentBId_idx" ON "DocumentConflict"("documentBId");

-- CreateIndex
CREATE INDEX "DocumentConflict_status_idx" ON "DocumentConflict"("status");

-- AddForeignKey
ALTER TABLE "DocumentConflict" ADD CONSTRAINT "DocumentConflict_documentAId_fkey" FOREIGN KEY ("documentAId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentConflict" ADD CONSTRAINT "DocumentConflict_documentBId_fkey" FOREIGN KEY ("documentBId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "OrgMemberMemory" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrgMemberMemory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OrgMemberMemory_orgId_userId_topic_key" ON "OrgMemberMemory"("orgId", "userId", "topic");

-- CreateIndex
CREATE INDEX "OrgMemberMemory_orgId_userId_idx" ON "OrgMemberMemory"("orgId", "userId");

-- CreateIndex
CREATE INDEX "OrgMemberMemory_lastSeenAt_idx" ON "OrgMemberMemory"("lastSeenAt");

-- AddForeignKey
ALTER TABLE "OrgMemberMemory" ADD CONSTRAINT "OrgMemberMemory_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgMemberMemory" ADD CONSTRAINT "OrgMemberMemory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
