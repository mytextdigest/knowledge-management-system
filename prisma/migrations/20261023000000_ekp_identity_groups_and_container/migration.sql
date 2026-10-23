-- EKP Workstream A (A-9/A-10): the user's Entra groups for the per-file
-- permission check, and the source container (SharePoint drive) of a synced item.

-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "external_container_id" TEXT;

-- AlterTable
ALTER TABLE "UserIdentity" ADD COLUMN     "group_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "groups_synced_at" TIMESTAMP(3),
ADD COLUMN     "owned_group_ids" TEXT[] DEFAULT ARRAY[]::TEXT[];
