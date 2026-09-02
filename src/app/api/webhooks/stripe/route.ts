import { NextResponse } from "next/server";
import { getStripeServer } from "@/lib/stripe/server";
import {
  handleCheckoutCompleted,
  handleSubscriptionUpdated,
  handleSubscriptionDeleted,
} from "@/lib/stripe/webhooks";
import { handleChargeDispute } from "@/lib/stripe/dispute";
import { handleStripeConnectAccountUpdated } from "@/lib/stripe/connect";
import type Stripe from "stripe";
import { getAdminDb } from "@/lib/firebase/admin";
import { emitWorkflowEvent } from "@/lib/workflows/events";

export const dynamic = "force-dynamic";

async function emitNormalizedPaymentEvent(event: Stripe.Event): Promise<void> {
  const object = event.data.object as unknown as {
    metadata?: Record<string, string>;
    customer?: string | null;
    amount_received?: number;
    amount?: number;
    currency?: string;
    status?: string;
  };
  const metadata = object.metadata ?? {};
  const subAccountId = metadata.subAccountId ?? metadata.sub_account_id;
  const contactId = metadata.contactId ?? metadata.contact_id;
  if (!subAccountId || !contactId) return;
  const sub = await getAdminDb().doc(`subAccounts/${subAccountId}`).get();
  const agencyId = sub.data()?.agencyId as string | undefined;
  if (!agencyId) return;
  const type =
    event.type === "checkout.session.completed"
      ? "payment.succeeded"
      : event.type === "payment_intent.payment_failed"
        ? "payment.failed"
        : event.type === "customer.subscription.created"
          ? "subscription.created"
          : event.type === "invoice.paid"
            ? "subscription.renewed"
            : event.type === "customer.subscription.deleted"
              ? "subscription.cancelled"
              : event.type === "charge.refunded"
                ? "refund.issued"
                : event.type === "customer.subscription.updated" &&
                    object.status === "paused"
                  ? "subscription.paused"
                  : null;
  if (!type) return;
  emitWorkflowEvent({
    eventType: type,
    eventId: event.id,
    agencyId,
    subAccountId,
    contactId,
    source: "stripe",
    occurredAt: new Date(event.created * 1000).toISOString(),
    deduplicationKey: event.id,
    payload: {
      customerId: object.customer ?? metadata.customerId ?? null,
      amount: object.amount_received ?? object.amount ?? null,
      currency: object.currency ?? null,
      subscriptionId:
        metadata.subscriptionId ?? metadata.subscription_id ?? null,
      providerEventType: event.type,
    },
  });
}

export async function POST(request: Request) {
  const body = await request.text();
  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json(
      { error: "Missing stripe-signature header" },
      { status: 400 }
    );
  }

  const stripe = getStripeServer();

  // Two separate Stripe event destinations point at this endpoint — one
  // scoped "Your account" (platform-level: our own Pro/Founders
  // subscriptions, disputes on our own charges) and one scoped "Connected
  // accounts" (course/offer purchases that ran as a direct charge on a
  // sub-account's own connected Stripe account, see stripe/connect.ts).
  // Stripe signs each destination with its own secret, so we try both.
  const secrets = [
    process.env.STRIPE_WEBHOOK_SECRET,
    process.env.STRIPE_CONNECT_WEBHOOK_SECRET,
  ].filter((s): s is string => !!s);

  let event: Stripe.Event | null = null;
  let lastError: unknown = null;
  for (const secret of secrets) {
    try {
      event = stripe.webhooks.constructEvent(body, signature, secret);
      break;
    } catch (err) {
      lastError = err;
    }
  }

  if (!event) {
    const message =
      lastError instanceof Error ? lastError.message : "Unknown error";
    console.error(`Webhook signature verification failed: ${message}`);
    return NextResponse.json(
      { error: `Webhook Error: ${message}` },
      { status: 400 }
    );
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutCompleted(
          event.data.object as Stripe.Checkout.Session
        );
        break;
      case "customer.subscription.updated":
        await handleSubscriptionUpdated(
          event.data.object as Stripe.Subscription
        );
        break;
      case "customer.subscription.created":
        break;
      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(
          event.data.object as Stripe.Subscription
        );
        break;
      // Chargeback opened — revoke GitHub access, assemble evidence draft,
      // flag the purchase + instance, and alert the operator. Requires the
      // Stripe webhook endpoint to subscribe to `charge.dispute.created`.
      case "charge.dispute.created":
        await handleChargeDispute(event.data.object as Stripe.Dispute);
        break;
      case "payment_intent.payment_failed":
      case "charge.refunded":
        break;
      // Fires whenever a connected sub-account's capabilities change —
      // keeps stripeConnect.chargesEnabled/payoutsEnabled in sync after
      // they finish Stripe's onboarding requirements post-connect.
      case "account.updated":
        await handleStripeConnectAccountUpdated(
          event.data.object as Stripe.Account
        );
        break;
      default:
        console.log(`Unhandled event type: ${event.type}`);
    }
    await emitNormalizedPaymentEvent(event);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error(`Error processing webhook event: ${message}`);
    return NextResponse.json(
      { error: "Webhook handler failed" },
      { status: 500 }
    );
  }

  return NextResponse.json({ received: true });
}
