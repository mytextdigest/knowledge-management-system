import { prisma } from "@/lib/prisma";

// Legacy per-user lookup. Subscription.managedByUserId is no longer unique
// (orgId is, now) — kept working via findFirst until the org-mandatory
// pivot's cutover phase removes this entirely.
export async function getUserSubscription(userId) {
  return prisma.subscription.findFirst({
    where: { managedByUserId: userId },
    include: { plan: true }
  });
}

export async function getOrgSubscription(orgId) {
  return prisma.subscription.findUnique({
    where: { orgId },
    include: { plan: true }
  });
}

export function isSubscriptionActive(subscription) {
  if (!subscription) return false;

  // Only these states allow access
  if (!["active", "trialing"].includes(subscription.status)) {
    return false;
  }

  // If Stripe says it's active, allow access
  // even if cancellation is scheduled
  if (subscription.cancelAtPeriodEnd) {
    // Only block if we KNOW the period has ended
    if (subscription.currentPeriodEnd) {
      return new Date(subscription.currentPeriodEnd) > new Date();
    }

    // If end date is missing, trust Stripe status
    return true;
  }

  return true;
}

