import { prisma } from "@/lib/prisma";
import { resolveOrgRole, isSuperAdmin, canManageDepartment } from "@/lib/orgGuard";
import { documentIdsPassingAcl } from "@/lib/access/documentAcl";

export async function resolveDocumentManagementAccess(email, documentId) {
  const document = await prisma.document.findUnique({
    where: { id: documentId },
    select: {
      id: true,
      userId: true,
      orgId: true,
      departmentId: true,
      projectId: true,
      selected: true,
      user: { select: { email: true } },
      project: {
        select: { id: true, orgId: true, departmentId: true, scope: true },
      },
    },
  });
  if (!document) return { document: null, user: null, role: null, canManage: false };

  // Personal/private documents may not have an organization. The uploader
  // always retains management rights.
  if (document.user?.email === email) {
    const orgId = document.orgId || document.project?.orgId || null;
    const resolved = orgId ? await resolveOrgRole(email, orgId) : { user: null, role: null };
    return {
      document,
      user: resolved.user,
      role: resolved.role,
      canManage: true,
    };
  }

  const orgId = document.orgId || document.project?.orgId || null;
  if (!orgId) return { document, user: null, role: null, canManage: false };

  const { user, role } = await resolveOrgRole(email, orgId);
  if (!user || !role) return { document, user, role, canManage: false };

  const departmentId = document.departmentId || document.project?.departmentId || null;
  const canManage =
    isSuperAdmin(role) ||
    (role === "dept_admin" &&
      Boolean(departmentId) &&
      (await canManageDepartment(role, departmentId, user.id)) &&
      // A-10: managing (asking, regenerating) reads the content, so a
      // dept_admin also needs the file's source permissions.
      (await documentIdsPassingAcl(prisma, [document.id], { userId: user.id })).has(document.id));

  return { document, user, role, canManage };
}
