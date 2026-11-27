import { headers } from "next/headers";
import { NextResponse } from "next/server";
import stripe from "@/lib/stripe";
import { prisma } from "@/lib/prisma";

export async function POST(req) {
  const body = await req.text();

  const signature = req.headers.get("stripe-signature");

  let event;

  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error("Webhook signature verification failed:", err.message);
    return new NextResponse("Webhook Error", { status: 400 });
  }

  switch (event.type) {
    case "checkout.session.completed":
      await handleCheckoutCompleted(event.data.object);
      break;

    case "customer.subscription.updated":
      await handleSubscriptionUpdated(event.data.object);
      break;

    case "customer.subscription.deleted":
      await handleSubscriptionDeleted(event.data.object);
      break;

    default:
      // Ignore other events
      break;
  }

  return NextResponse.json({ received: true });
}




async function handleCheckoutCompleted(session) {
  const { orgId, managedByUserId, planId } = session.metadata;

  const subscription = await stripe.subscriptions.retrieve(
    session.subscription
  );

  const data = {
    managedByUserId: managedByUserId || null,
    planId,
    status: subscription.status,
    stripeCustomerId: subscription.customer,
    stripeSubscriptionId: subscription.id,
    currentPeriodEnd: new Date(subscription.current_period_end * 1000)
  };

  if (orgId) {
    await prisma.subscription.upsert({
      where: { orgId },
      update: data,
      create: { ...data, orgId }
    });
    return;
  }

  // Legacy per-user checkout (no orgId in metadata) — kept working until
  // the org-mandatory pivot's cutover phase removes this path entirely.
  const existing = await prisma.subscription.findFirst({
    where: { managedByUserId }
  });

  if (existing) {
    await prisma.subscription.update({ where: { id: existing.id }, data });
  } else {
    await prisma.subscription.create({ data });
  }
}

  

async function handleSubscriptionUpdated(subscription) {
  const priceId = subscription.items.data[0]?.price?.id;
  if (!priceId) return;

  const plan = await prisma.plan.findUnique({
    where: { stripePriceId: priceId }
  });
  if (!plan) return;

  const updateData = {
    planId: plan.id,
    status: subscription.status,

    // Stripe toggles this when cancel / undo cancel happens
    cancelAtPeriodEnd: Boolean(subscription.cancel_at_period_end),
  };

  // Only update the end date when Stripe explicitly sends it
  if (typeof subscription.current_period_end === "number") {
    updateData.currentPeriodEnd = new Date(
      subscription.current_period_end * 1000
    );
  }

  await prisma.subscription.updateMany({
    where: {
      stripeSubscriptionId: subscription.id
    },
    data: updateData
  });
}






async function handleSubscriptionDeleted(subscription) {
  await prisma.subscription.updateMany({
    where: {
      stripeSubscriptionId: subscription.id
    },
    data: {
      status: "canceled",
      cancelAtPeriodEnd: false,
      currentPeriodEnd: null
    }
  });
}




  
  



