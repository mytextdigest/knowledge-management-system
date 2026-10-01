import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { resolveOrgRole, isSuperAdmin } from "@/lib/orgGuard";
import { getOrgSubscription, isSubscriptionActive } from "@/lib/subscription";
import { getOrgOpenAIKey } from "@/utils/key_helper";

export default async function OrgLayout({ children, params }) {
  const { orgId } = await params;
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/auth/signin");

  const { user, role } = await resolveOrgRole(session.user.email, orgId);
  if (!user || !role) redirect("/welcome-back");

  const subscription = await getOrgSubscription(orgId);
  if (!isSubscriptionActive(subscription)) {
    if (isSuperAdmin(role)) redirect(`/onboarding/${orgId}/billing`);
    // billing-locked intentionally lives outside this (app)/org/[orgId]
    // tree — it isn't subject to this same layout gate, same pattern as
    // /org/invite/[token] bypassing the personal API-key guard.
    redirect(`/org/${orgId}/billing-locked?reason=subscription`);
  }

  const apiKey = await getOrgOpenAIKey(orgId);
  if (!apiKey) {
    if (isSuperAdmin(role)) redirect(`/onboarding/${orgId}/api-key`);
    redirect(`/org/${orgId}/billing-locked?reason=apikey`);
  }

  return <>{children}</>;
}
