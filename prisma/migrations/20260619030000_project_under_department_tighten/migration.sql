-- Tighten Project.departmentId to NOT NULL and move uniqueness from
-- per-org to per-department. Run only after the backfill script has
-- confirmed there are no Projects left with a null departmentId.

DROP INDEX "Project_orgId_name_key";

ALTER TABLE "Project" ALTER COLUMN "departmentId" SET NOT NULL;

CREATE UNIQUE INDEX "Project_departmentId_name_key" ON "Project"("departmentId", "name");
