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

  const { planId, orgId } = await req.json();

  const plan = await prisma.plan.findUnique({
    where: { id: planId }
  });

  if (!plan || !plan.isActive) {
    return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
  }

  // Org-scoped checkout (org-mandatory pivot). Legacy per-user checkout
  // (orgId omitted) is kept working until that pivot's cutover phase.
  if (orgId) {
    const { user, role } = await resolveOrgRole(session.user.email, orgId);
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
    if (!isSuperAdmin(role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const existing = await prisma.subscription.findUnique({ where: { orgId } });
    if (existing && ["active", "trialing"].includes(existing.status)) {
      return NextResponse.json(
        { error: "Subscription already active" },
        { status: 400 }
      );
    }

    const checkoutSession = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      customer_email: session.user.email,
      line_items: [{ price: plan.stripePriceId, quantity: 1 }],
      success_url: `${process.env.NEXT_PUBLIC_APP_URL}/onboarding/${orgId}/api-key`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/onboarding/${orgId}/billing`,
      metadata: { orgId, managedByUserId: session.user.id, planId: plan.id }
    });

    return NextResponse.json({ url: checkoutSession.url });
  }

  // Optional: prevent double subscription
  const existing = await prisma.subscription.findFirst({
    where: { managedByUserId: session.user.id }
  });

  if (existing && ["active", "trialing"].includes(existing.status)) {
    return NextResponse.json(
      { error: "Subscription already active" },
      { status: 400 }
    );
  }

  const checkoutSession = await stripe.checkout.sessions.create({
    mode: "subscription",
    payment_method_types: ["card"],
    customer_email: session.user.email,

    line_items: [
      {
        price: plan.stripePriceId,
        quantity: 1
      }
    ],

    // Legacy per-user checkout path — /dashboard and /subscribe no longer
    // exist post org-mandatory-pivot, but this branch only runs if something
    // calls this endpoint without an orgId, which no UI does anymore.
    success_url: `${process.env.NEXT_PUBLIC_APP_URL}/welcome-back`,
    cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/welcome-back`,

    metadata: {
      managedByUserId: session.user.id,
      planId: plan.id
    }
  });

  return NextResponse.json({ url: checkoutSession.url });
}
