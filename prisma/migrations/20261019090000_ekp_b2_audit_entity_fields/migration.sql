-- B-2: additive audit fields; preserves existing audit rows and callers.
ALTER TABLE "AuditLog"
  ADD COLUMN "entity_type" TEXT,
  ADD COLUMN "entity_id" TEXT,
  ADD COLUMN "before" JSONB,
  ADD COLUMN "after" JSONB;

CREATE INDEX "AuditLog_entity_type_entity_id_idx" ON "AuditLog"("entity_type", "entity_id");
