import { prisma } from "@/lib/prisma";

export async function resolveOrgRole(email, orgId) {
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });
  if (!user) return { user: null, role: null };

  const member = await prisma.organizationMember.findUnique({
    where: { orgId_userId: { orgId, userId: user.id } },
    select: { role: true },
  });
  return { user, role: member?.role ?? null };
}

export function isSuperAdmin(role) {
  return role === "super_admin";
}

// super_admin and dept_admin
export function isOrgAdmin(role) {
  return role === "super_admin" || role === "dept_admin";
}

// super_admin can manage any department; an org-level dept_admin can only
// manage departments where they hold a DepartmentMember.role of "admin".
export async function canManageDepartment(orgRole, departmentId, userId) {
  if (orgRole === "super_admin") return true;
  if (orgRole !== "dept_admin") return false;

  const membership = await prisma.departmentMember.findUnique({
    where: { departmentId_userId: { departmentId, userId } },
    select: { role: true },
  });
  return membership?.role === "admin";
}
