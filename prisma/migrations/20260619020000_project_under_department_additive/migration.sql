-- Nest Projects under Departments: org -> dept -> project -> document,
-- alongside the existing org -> dept -> document (repository) path.
-- Additive only: departmentId is nullable until the backfill script runs.

ALTER TABLE "Project" ADD COLUMN "departmentId" TEXT;

CREATE INDEX "Project_departmentId_idx" ON "Project"("departmentId");

ALTER TABLE "Project" ADD CONSTRAINT "Project_departmentId_fkey"
  FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;
