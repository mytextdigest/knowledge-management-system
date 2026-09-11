import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveOrgRole, isSuperAdmin } from "@/lib/orgGuard";
import { getOrgSubscription, isSubscriptionActive } from "@/lib/subscription";
import OnboardingBillingClient from "@/components/onboarding/OnboardingBillingClient";

export const dynamic = "force-dynamic";

export default async function OnboardingBillingPage({ params }) {
  const { orgId } = await params;
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/auth/signin");

  const { user, role } = await resolveOrgRole(session.user.email, orgId);
  if (!user || !role) redirect("/welcome-back");
  if (!isSuperAdmin(role)) redirect(`/org/${orgId}/billing-locked`);

  // Already paid — skip forward.
  const subscription = await getOrgSubscription(orgId);
  if (isSubscriptionActive(subscription)) {
    redirect(`/onboarding/${orgId}/api-key`);
  }

  const plans = await prisma.plan.findMany({
    where: { isActive: true },
    orderBy: { storageLimitGb: "asc" },
  });

  return <OnboardingBillingClient orgId={orgId} plans={plans} />;
}
