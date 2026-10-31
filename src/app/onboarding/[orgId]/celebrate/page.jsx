import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveOrgRole } from "@/lib/orgGuard";
import { getOrgSubscription, isSubscriptionActive } from "@/lib/subscription";
import { getOrgOpenAIKey } from "@/utils/key_helper";
import OnboardingCelebrateClient from "@/components/onboarding/OnboardingCelebrateClient";

export const dynamic = "force-dynamic";

export default async function OnboardingCelebratePage({ params }) {
  const { orgId } = await params;
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/auth/signin");

  const { user, role } = await resolveOrgRole(session.user.email, orgId);
  if (!user || !role) redirect("/welcome-back");

  // Already celebrated once before — never show this again, even for this org.
  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { hasCompletedOnboarding: true },
  });
  if (dbUser.hasCompletedOnboarding) redirect(`/org/${orgId}`);

  // Defend against skipping ahead by URL.
  const subscription = await getOrgSubscription(orgId);
  if (!isSubscriptionActive(subscription)) redirect(`/onboarding/${orgId}/billing`);
  const apiKey = await getOrgOpenAIKey(orgId);
  if (!apiKey) redirect(`/onboarding/${orgId}/api-key`);

  return <OnboardingCelebrateClient orgId={orgId} />;
}
