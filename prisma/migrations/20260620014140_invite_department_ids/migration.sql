-- AlterTable
ALTER TABLE "OrganizationInvite" ADD COLUMN     "departmentIds" TEXT[] DEFAULT ARRAY[]::TEXT[];
