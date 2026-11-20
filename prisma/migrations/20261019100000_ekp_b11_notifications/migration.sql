-- Additive migration only. DO NOT APPLY until Neon migration history is reconciled.
CREATE TABLE "Notification" (
 "id" TEXT NOT NULL, "orgId" TEXT NOT NULL, "userId" TEXT NOT NULL,
 "type" TEXT NOT NULL, "title" TEXT NOT NULL, "body" TEXT,
 "link" TEXT, "read_at" TIMESTAMP(3), "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "NotificationPreference" (
 "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "type" TEXT NOT NULL,
 "inApp" BOOLEAN NOT NULL DEFAULT true, "email" BOOLEAN NOT NULL DEFAULT true,
 CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Notification_userId_read_at_idx" ON "Notification"("userId", "read_at");
CREATE INDEX "Notification_orgId_userId_created_at_idx" ON "Notification"("orgId", "userId", "created_at");
CREATE UNIQUE INDEX "NotificationPreference_userId_type_key" ON "NotificationPreference"("userId", "type");
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
