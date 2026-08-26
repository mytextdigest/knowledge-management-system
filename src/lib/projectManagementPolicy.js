import { prisma } from "@/lib/prisma";
import { resolveOrgRole, isSuperAdmin, canManageDepartment } from "@/lib/orgGuard";

export async function resolveProjectManagementAccess(email, projectId) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, orgId: true, departmentId: true, userId: true },
  });
  if (!project) return { project: null, user: null, role: null, canManage: false };

  const { user, role } = await resolveOrgRole(email, project.orgId);
  if (!user || !role) return { project, user, role, canManage: false };

  const canManage =
    project.userId === user.id ||
    isSuperAdmin(role) ||
    (role === "dept_admin" &&
      Boolean(project.departmentId) &&
      (await canManageDepartment(role, project.departmentId, user.id)));

  return { project, user, role, canManage };
}
