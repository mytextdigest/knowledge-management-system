import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveOrgRole, isSuperAdmin } from "@/lib/orgGuard";
import { getOrgSubscription, isSubscriptionActive } from "@/lib/subscription";
import OnboardingApiKeyClient from "@/components/onboarding/OnboardingApiKeyClient";

export const dynamic = "force-dynamic";

export default async function OnboardingApiKeyPage({ params }) {
  const { orgId } = await params;
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/auth/signin");

  const { user, role } = await resolveOrgRole(session.user.email, orgId);
  if (!user || !role) redirect("/welcome-back");
  if (!isSuperAdmin(role)) redirect(`/org/${orgId}/billing-locked`);

  const subscription = await getOrgSubscription(orgId);
  if (!isSubscriptionActive(subscription)) {
    redirect(`/onboarding/${orgId}/billing`);
  }

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { hasCompletedOnboarding: true },
  });

  return (
    <OnboardingApiKeyClient
      orgId={orgId}
      nextStep={dbUser.hasCompletedOnboarding ? `/org/${orgId}` : `/onboarding/${orgId}/celebrate`}
    />
  );
}
