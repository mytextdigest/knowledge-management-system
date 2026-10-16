import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export default async function OrgHomePage({ params }) {
  const { orgId } = await params;

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect('/auth/signin');

  const membership = await prisma.organizationMember.findUnique({
    where: { orgId_userId: { orgId, userId: session.user.id } },
  });
  if (!membership) redirect('/welcome-back');

  // Slack-style "remembers which channel you were last on" — fall back to
  // the org's oldest department (its "#general") on first visit.
  let department = membership.lastDepartmentId
    ? await prisma.department.findFirst({ where: { id: membership.lastDepartmentId, orgId } })
    : null;

  if (!department) {
    department = await prisma.department.findFirst({
      where: { orgId },
      orderBy: { createdAt: 'asc' },
    });
  }

  if (department) redirect(`/org/${orgId}/department/${department.id}`);

  // Brand-new org with no departments at all (shouldn't normally happen
  // now that org creation auto-creates a default one).
  redirect(`/org/${orgId}/settings?tab=departments`);
}
