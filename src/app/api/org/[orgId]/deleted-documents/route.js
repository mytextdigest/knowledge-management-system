import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { resolveOrgRole } from '@/lib/orgGuard';
import { documentIdsPassingAcl } from '@/lib/access/documentAcl';

// B-9 (E23): soft-deleted repository documents the viewer may restore, newest
// first. Same rule as POST /api/documents/[id]/restore: the uploader, a super
// admin, or an admin of the document's department who passes its ACL.
export async function GET(_request, { params }) {
  const { orgId } = await params;
  const session = await getServerSession();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { user, role } = await resolveOrgRole(session.user.email, orgId);
  if (!user || !role) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  let scope = { userId: user.id };
  let adminDeptIds = [];
  if (role === 'super_admin') scope = {};
  else if (role === 'dept_admin') {
    adminDeptIds = (await prisma.departmentMember.findMany({ where: { userId: user.id, role: 'admin', department: { orgId } }, select: { departmentId: true } }))
      .map((m) => m.departmentId);
    scope = { OR: [{ userId: user.id }, { departmentId: { in: adminDeptIds } }] };
  }
  const rows = await prisma.document.findMany({
    where: { orgId, scope: 'repository', deletedAt: { not: null }, ...scope },
    select: {
      id: true, filename: true, userId: true, departmentId: true, lifecycle: true, deletedAt: true, purgeAfter: true, deletedById: true,
      department: { select: { name: true } },
    },
    orderBy: { deletedAt: 'desc' }, take: 200,
  });
  let items = rows;
  if (role === 'dept_admin') {
    const viaDept = rows.filter((d) => d.userId !== user.id).map((d) => d.id);
    const passing = await documentIdsPassingAcl(prisma, viaDept, { userId: user.id });
    items = rows.filter((d) => d.userId === user.id || passing.has(d.id));
  }
  const deleters = await prisma.user.findMany({
    where: { id: { in: [...new Set(items.map((d) => d.deletedById).filter(Boolean))] } }, select: { id: true, name: true, email: true },
  });
  const byId = new Map(deleters.map((u) => [u.id, u]));
  return NextResponse.json({ items: items.map(({ userId: _u, deletedById, ...d }) => ({ ...d, deletedBy: byId.get(deletedById) || null })) });
}
