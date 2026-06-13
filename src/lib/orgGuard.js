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
