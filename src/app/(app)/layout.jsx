import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function AppLayout({ children }) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    redirect("/auth/signin");
  }

  const membershipCount = await prisma.organizationMember.count({
    where: { userId: session.user.id },
  });

  // No org yet — every workspace lives inside an organization now, so this
  // is the mandatory first stop. Subscription/API-key checks are per-org
  // (see (app)/org/[orgId]/layout.jsx), not global, since one org's lapsed
  // billing shouldn't lock a user out of their other orgs.
  if (membershipCount === 0) {
    redirect("/onboarding/start");
  }

  return <>{children}</>;
}
