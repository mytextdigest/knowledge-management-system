-- Step 1 of the org-mandatory pivot ("Migration A" in the implementation plan):
-- purely additive/nullable changes, safe to deploy with zero impact on existing
-- rows. Constraint-tightening (NOT NULL / new UNIQUE keys) happens in a later
-- "Migration B" only after the one-off backfill script has run.

-- User: persisted "has this user ever finished the onboarding wizard" flag
ALTER TABLE "User" ADD COLUMN "has_completed_onboarding" BOOLEAN NOT NULL DEFAULT false;

-- Organization: storage tracking moves here from User once billing is org-scoped
ALTER TABLE "Organization" ADD COLUMN "storage_used_bytes" BIGINT NOT NULL DEFAULT 0;

-- Subscription: rename userId -> managedByUserId (denormalized "who pays",
-- no longer the join key), drop its old unique constraint, add orgId as the
-- new (nullable for now) unique key.
DROP INDEX "Subscription_userId_key";
ALTER TABLE "Subscription" RENAME COLUMN "userId" TO "managedByUserId";
ALTER TABLE "Subscription" ALTER COLUMN "managedByUserId" DROP NOT NULL;
ALTER TABLE "Subscription" DROP CONSTRAINT "Subscription_userId_fkey";
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_managedByUserId_fkey"
  FOREIGN KEY ("managedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Subscription" ADD COLUMN "orgId" TEXT;
CREATE UNIQUE INDEX "Subscription_orgId_key" ON "Subscription"("orgId");
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_orgId_fkey"
  FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Project / Document: default value changes only — existing rows keep
-- whatever scope they already have, only future inserts pick up the new
-- defaults ('org' / 'project' instead of 'private').
ALTER TABLE "Project" ALTER COLUMN "scope" SET DEFAULT 'org';
ALTER TABLE "Document" ALTER COLUMN "scope" SET DEFAULT 'project';
