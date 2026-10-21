-- Lets users rename an org chat conversation instead of always showing
-- the first-message-derived preview.
ALTER TABLE "OrgConversation" ADD COLUMN "title" TEXT;
