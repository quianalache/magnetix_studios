import { NextResponse } from "next/server";
import { getStripeServer } from "@/lib/stripe/server";
import { verifyStripeWebhook } from "@/lib/stripe/webhook-verification";
import {
  handleCheckoutCompleted,
  handleSubscriptionUpdated,
  handleSubscriptionDeleted,
} from "@/lib/stripe/webhooks";
import {
  INVOICE_PAYMENT_KIND,
  handleInvoiceStripeCheckoutCompleted,
} from "@/lib/server/invoice-payment-service";
import {
  syncExternalStripeInvoicePayment,
  syncExternalStripePaymentIntent,
  syncExternalStripeChargeRefund,
} from "@/lib/server/external-payment-sync-service";
import { handleChargeDispute } from "@/lib/stripe/dispute";
import {
  CHECKOUT_ORDER_KIND,
  handleCheckoutOrderInvoicePaid,
  handleCheckoutOrderPaymentIntent,
} from "@/lib/server/checkout/order-service";
import { handleStripeConnectAccountUpdated } from "@/lib/stripe/connect";
import type Stripe from "stripe";
import { processStripeWorkflowEvent } from "@/lib/server/payment-workflow-events";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = await request.text();
  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json(
      { error: "Missing stripe-signature header" },
      { status: 400 }
    );
  }

  // Signature construction is local, but the Stripe SDK still needs a
  // configured key. Prefer the existing deployment default; allow a
  // live-only configuration to verify its live endpoint without inventing a
  // test fallback.
  const stripe = getStripeServer(
    process.env.STRIPE_SECRET_KEY?.trim() ? undefined : "live"
  );

  // Up to four Stripe event destinations point at this endpoint: "Your
  // account" (platform-level: our own Pro/Founders subscriptions, disputes on
  // our own charges) and "Connected accounts" (course/offer purchases that
  // ran as a direct charge on a sub-account's own connected Stripe account,
  // see stripe/connect.ts), each in TEST and — once configured — LIVE mode.
  // Stripe signs each destination with its own secret; the secret that
  // verifies the event fixes its trusted mode + scope
  // (lib/stripe/webhook-verification.ts).
  const verified = verifyStripeWebhook({ stripe, body, signature });
  if (!verified.ok) {
    console.error(`Webhook signature verification failed: ${verified.message}`);
    return NextResponse.json(
      { error: `Webhook Error: ${verified.message}` },
      { status: 400 }
    );
  }
  const event: Stripe.Event = verified.event;
  // The verified endpoint's mode — authoritative for every Stripe call and
  // record match below (never the deployment's default key).
  const mode = verified.context.mode;

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutCompleted(
          event.data.object as Stripe.Checkout.Session
        );
        break;
      // Delayed payment methods (e.g. bank debits) confirm HERE, not at
      // `.completed` — that event can fire with payment_status:"unpaid"
      // for these. Routed narrowly to the Invoice-payment handler only:
      // no other Stripe integration in this repo currently needs this
      // event, and routing it through the general handleCheckoutCompleted
      // dispatcher would re-exercise every other kind's `.completed`
      // logic a second time for an event type those handlers were never
      // designed to receive. Requires "checkout.session.async_payment_
      // succeeded" to be added to this webhook endpoint's subscribed
      // events in the Stripe Dashboard — NOT something this code can
      // configure remotely.
      case "checkout.session.async_payment_succeeded": {
        const asyncSession = event.data.object as Stripe.Checkout.Session;
        if (asyncSession.metadata?.kind === INVOICE_PAYMENT_KIND) {
          await handleInvoiceStripeCheckoutCompleted(asyncSession);
        }
        break;
      }
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
      // MyMagnetix -> Purchases fix (2026-09-16): these four event types
      // are what keep the customer-facing billing ledger
      // (externalSubscriptions/externalPayments) live for every purchase
      // origin these sync functions recognize — currently native Course
      // Offer/Standalone Course purchases (via metadata.kind) and any
      // already-imported/reconciled subscription. Each call is a genuine
      // no-op ({outcome:"no_match"}) for every OTHER kind of Stripe event
      // this endpoint receives (Client Billing, Founders, Invoices,
      // platform signup) — resolveRelationship in
      // external-payment-sync-service.ts only ever matches those two
      // specific sources, so this is safe to route unconditionally rather
      // than needing its own metadata.kind branch here.
      case "invoice.paid":
        // Checkout Foundation: a checkout order's subscription invoice
        // fulfils the order (idempotent; verified against Stripe).
        await handleCheckoutOrderInvoicePaid(
          event.data.object as Stripe.Invoice,
          event.account ?? null
        );
        await syncExternalStripeInvoicePayment({
          invoice: event.data.object as Stripe.Invoice,
          eventAccountId: event.account ?? null,
          eventCreated: event.created,
          outcome: "succeeded",
          mode,
        });
        break;
      case "invoice.payment_failed":
        await syncExternalStripeInvoicePayment({
          invoice: event.data.object as Stripe.Invoice,
          eventAccountId: event.account ?? null,
          eventCreated: event.created,
          outcome: "failed",
          mode,
        });
        break;
      case "payment_intent.succeeded":
        if (
          (event.data.object as Stripe.PaymentIntent).metadata?.kind ===
          CHECKOUT_ORDER_KIND
        ) {
          await handleCheckoutOrderPaymentIntent(
            event.data.object as Stripe.PaymentIntent,
            event.account ?? null
          );
        }
        await syncExternalStripePaymentIntent({
          paymentIntent: event.data.object as Stripe.PaymentIntent,
          eventAccountId: event.account ?? null,
          eventCreated: event.created,
          outcome: "succeeded",
          mode,
        });
        break;
      case "payment_intent.payment_failed":
        await syncExternalStripePaymentIntent({
          paymentIntent: event.data.object as Stripe.PaymentIntent,
          eventAccountId: event.account ?? null,
          eventCreated: event.created,
          outcome: "failed",
          mode,
        });
        break;
      case "charge.refunded":
        await syncExternalStripeChargeRefund({
          charge: event.data.object as Stripe.Charge,
          eventAccountId: event.account ?? null,
          eventCreated: event.created,
          mode,
        });
        break;
      // Fires whenever a connected sub-account's capabilities change —
      // keeps stripeConnect.chargesEnabled/payoutsEnabled in sync after
      // they finish Stripe's onboarding requirements post-connect.
      case "account.updated":
        await handleStripeConnectAccountUpdated(
          event.data.object as Stripe.Account,
          mode
        );
        break;
      default:
        console.log(`Unhandled event type: ${event.type}`);
    }
    // CRM Foundations Batch C: the verified event → the Workflow Builder's
    // payment & subscription triggers (logical events, account-scoped
    // contact resolution, persisted idempotency). Runs AFTER the billing
    // handlers above so order / purchase / ledger records exist. Agency and
    // platform billing never reach workspace workflows. Never calls Stripe.
    await processStripeWorkflowEvent(event);
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
