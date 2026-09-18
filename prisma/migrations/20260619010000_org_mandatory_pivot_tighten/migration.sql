-- Step 3 of the org-mandatory pivot ("Migration B" in the implementation
-- plan). Only safe to run after scripts/backfill-org-mandatory.js has
-- confirmed zero orgId-null Project/Subscription rows remain.

-- Project: orgId required, uniqueness moves from per-creator to per-org,
-- and losing the org now cascades the project (it can no longer float
-- org-less the way the old onDelete: SetNull allowed).
ALTER TABLE "Project" ALTER COLUMN "orgId" SET NOT NULL;
DROP INDEX "Project_userId_name_key";
CREATE UNIQUE INDEX "Project_orgId_name_key" ON "Project"("orgId", "name");
ALTER TABLE "Project" DROP CONSTRAINT "Project_orgId_fkey";
ALTER TABLE "Project" ADD CONSTRAINT "Project_orgId_fkey"
  FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Subscription: orgId required (it's already unique from Migration A).
ALTER TABLE "Subscription" ALTER COLUMN "orgId" SET NOT NULL;
