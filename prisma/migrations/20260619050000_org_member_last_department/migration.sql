-- Slack-style "remembers which channel you were last on" — persisted on
-- the membership row (DB-backed, not a cookie) so it survives logout/login.
ALTER TABLE "OrganizationMember" ADD COLUMN "lastDepartmentId" TEXT;

CREATE INDEX "OrganizationMember_lastDepartmentId_idx" ON "OrganizationMember"("lastDepartmentId");

ALTER TABLE "OrganizationMember" ADD CONSTRAINT "OrganizationMember_lastDepartmentId_fkey"
  FOREIGN KEY ("lastDepartmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;
