// EKP B-10 (E24): the accountable owner of a new document. Used by uploads,
// the SharePoint and ServiceNow syncs (worker) and the owner backfill, so
// relative imports only.
//
//   connector documents (SharePoint, ServiceNow): the department's default
//     owner when set, otherwise the user who connected the integration
//   uploads: the uploader, or the department's default owner when the org
//     setting ownership.default is "department_owner" and one is set
// A department default owner who has left the org is skipped.

import { getSetting } from "../settings/index.js";

const CONNECTORS = new Set(["sharepoint", "servicenow"]);

export async function defaultOwnerId(db, { orgId, departmentId, uploaderId, sourceProvider = "manual" }) {
  if (orgId && departmentId) {
    const preferDepartment = CONNECTORS.has(sourceProvider) ||
      (await getSetting(orgId, "ownership.default")) === "department_owner";
    if (preferDepartment) {
      const department = await db.department.findFirst({
        where: { id: departmentId, orgId }, select: { defaultOwnerId: true },
      });
      if (department?.defaultOwnerId) {
        const member = await db.organizationMember.findUnique({
          where: { orgId_userId: { orgId, userId: department.defaultOwnerId } }, select: { userId: true },
        });
        if (member) return department.defaultOwnerId;
      }
    }
  }
  return uploaderId ?? null;
}
