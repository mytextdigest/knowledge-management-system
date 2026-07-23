import { prisma } from "@/lib/prisma";
import { isOrgAdmin } from "@/lib/orgGuard";

// Mirrors the per-document RBAC check in src/app/api/documents/[id]/route.js's
// GET handler (owner, else org admin, else non-draft + department membership),
// but batched for endpoints that aggregate many documents at once (e.g. a
// project/department timeline list) so membership only needs one query.
export async function filterAccessibleDocuments(documents, { userId, role }) {
  if (isOrgAdmin(role)) return documents;

  const deptIds = [
    ...new Set(
      documents
        .filter((d) => d.userId !== userId && d.departmentId)
        .map((d) => d.departmentId)
    ),
  ];

  const memberships = deptIds.length
    ? await prisma.departmentMember.findMany({
        where: { departmentId: { in: deptIds }, userId },
        select: { departmentId: true },
      })
    : [];
  const memberDeptIds = new Set(memberships.map((m) => m.departmentId));

  return documents.filter((d) => {
    if (d.userId === userId) return true;
    if (d.lifecycle === "draft") return false;
    if (!d.departmentId) return true;
    return memberDeptIds.has(d.departmentId);
  });
}
