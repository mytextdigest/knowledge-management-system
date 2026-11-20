import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import OnboardingStartClient from "@/components/onboarding/OnboardingStartClient";

export default async function OnboardingStartPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/auth/signin");

  const membershipCount = await prisma.organizationMember.count({
    where: { userId: session.user.id },
  });

  // Already has an org — this page is only for the zero-org funnel.
  if (membershipCount > 0) redirect("/welcome-back");

  return <OnboardingStartClient />;
}
