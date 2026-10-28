import { prisma } from "@/lib/prisma";
import { ensureFreshPrincipals } from "@/lib/identity/entraIdentity";

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
  // A-10: SharePoint per-file access is checked against the Entra groups
  // stored on the user's identities; refresh them when stale (at most once a
  // minute per user, a Graph call at most every 15 minutes, never throws).
  if (member) await ensureFreshPrincipals(prisma, user.id);
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

// Any membership (not just "admin") in the department, or an org-wide admin
// role. Used to gate contribution-type actions (e.g. adding a Lesson) that
// should be open to regular department members, not just department admins.
export async function canContributeToDepartment(orgRole, departmentId, userId) {
  if (isOrgAdmin(orgRole)) return true;
  if (!departmentId) return false;

  const membership = await prisma.departmentMember.findUnique({
    where: { departmentId_userId: { departmentId, userId } },
    select: { role: true },
  });
  return Boolean(membership);
}
