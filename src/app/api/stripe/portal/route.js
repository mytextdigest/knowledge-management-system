import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import stripe from "@/lib/stripe";
import { resolveOrgRole, isSuperAdmin } from "@/lib/orgGuard";

export async function POST(req) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { orgId } = await req.json().catch(() => ({}));

  let subscription;
  let returnUrl = `${process.env.NEXT_PUBLIC_APP_URL}/welcome-back`;

  if (orgId) {
    const { user, role } = await resolveOrgRole(session.user.email, orgId);
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
    if (!isSuperAdmin(role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    subscription = await prisma.subscription.findUnique({ where: { orgId } });
    returnUrl = `${process.env.NEXT_PUBLIC_APP_URL}/org/${orgId}`;
  } else {
    // Legacy per-user portal — kept working until the org-mandatory pivot's
    // cutover phase removes this path entirely.
    subscription = await prisma.subscription.findFirst({
      where: { managedByUserId: session.user.id }
    });
  }

  if (!subscription || !subscription.stripeCustomerId) {
    return NextResponse.json(
      { error: "No active subscription" },
      { status: 400 }
    );
  }

  const portalSession = await stripe.billingPortal.sessions.create({
    customer: subscription.stripeCustomerId,
    configuration: process.env.STRIPE_CLOUD_PORTAL_CONFIG_ID,
    return_url: returnUrl
  });

  return NextResponse.json({ url: portalSession.url });
}
