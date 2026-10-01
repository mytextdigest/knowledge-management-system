import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { resolveOrgRole } from '@/lib/orgGuard';

export async function GET(req) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return NextResponse.json(null);
  }

  const { searchParams } = new URL(req.url);
  const orgId = searchParams.get('orgId');

  if (!orgId) {
    return NextResponse.json({ error: 'orgId is required' }, { status: 400 });
  }

  const { user, role } = await resolveOrgRole(session.user.email, orgId);
  if (!user || !role) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const subscription = await prisma.subscription.findUnique({
    where: { orgId },
    include: {
      plan: true,
      organization: {
        select: {
          storageUsedBytes: true
        }
      }
    }
  });

  if (!subscription) {
    return NextResponse.json(null);
  }

  // 🔑 Strip the raw (BigInt-carrying) organization before spreading, and
  // convert BigInt → string on the copy we actually return.
  const { organization, ...subscriptionWithoutOrg } = subscription;

  return NextResponse.json({
    ...subscriptionWithoutOrg,
    organization: {
      ...organization,
      storageUsedBytes: organization.storageUsedBytes.toString()
    }
  });
}
