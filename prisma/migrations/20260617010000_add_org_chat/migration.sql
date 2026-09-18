-- CreateTable
CREATE TABLE "OrgConversation" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrgConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrgMessage" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrgMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OrgConversation_orgId_idx" ON "OrgConversation"("orgId");

-- CreateIndex
CREATE INDEX "OrgConversation_userId_idx" ON "OrgConversation"("userId");

-- CreateIndex
CREATE INDEX "OrgMessage_conversationId_idx" ON "OrgMessage"("conversationId");

-- AddForeignKey
ALTER TABLE "OrgConversation" ADD CONSTRAINT "OrgConversation_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgConversation" ADD CONSTRAINT "OrgConversation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgMessage" ADD CONSTRAINT "OrgMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "OrgConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
