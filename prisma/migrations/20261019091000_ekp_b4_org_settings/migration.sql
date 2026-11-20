-- B-4 additive migration; run only after the Stream A migration history is reconciled.
CREATE TABLE "OrgSetting" (
 "id" TEXT NOT NULL, "orgId" TEXT NOT NULL, "key" TEXT NOT NULL,
 "value" JSONB NOT NULL, "updatedBy" TEXT,
 "updated_at" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "OrgSetting_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "OrgSetting_orgId_key_key" ON "OrgSetting"("orgId", "key");
ALTER TABLE "OrgSetting" ADD CONSTRAINT "OrgSetting_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
