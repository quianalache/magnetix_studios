import "server-only";

import type Stripe from "stripe";
import { getStripeServer } from "@/lib/stripe/server";
import {
  findExternalBillingCustomerByProviderCustomer,
  upsertExternalBillingCustomer,
  upsertExternalSubscription,
} from "@/lib/server/external-billing-service";
import {
  syncExternalStripeInvoicePayment,
  syncExternalStripePaymentIntent,
} from "@/lib/server/external-payment-sync-service";
import type { ExternalSubscriptionStatus } from "@/types/external-billing";

/**
 * Native-checkout -> MyMagnetix billing-ledger sync (2026-09-16 fix).
 *
 * ROOT CAUSE this closes: native purchases (Course Offers, Standalone
 * Courses) have ALWAYS written their own entitlement record
 * (CourseOfferPurchase / StandaloneCoursePurchase) — that's real, correct,
 * and untouched by this file. But MyMagnetix -> Purchases reads EXCLUSIVELY
 * from the provider-neutral `externalSubscriptions`/`externalPayments`
 * ledger (mymagnetix-service.ts's listSubscriptionsForPerson /
 * listPaymentHistoryForPerson), which native checkout never wrote to — only
 * the separate historical-import/backfill path did. A real, successful,
 * access-granting native purchase was therefore invisible on the one
 * customer-facing billing page, even though everything else about it
 * worked correctly.
 *
 * ARCHITECTURE DECISION (the task's own "Option A" vs "Option B" question):
 * Option A — native checkout also writes into the SAME
 * ExternalSubscription/ExternalPayment ledger MyMagnetix already reads.
 * Chosen over Option B (teaching the read layer to merge two ledgers)
 * because the write-side primitives already exist, are already idempotent
 * (deterministic doc ids keyed on provider+account+external id — see
 * upsertExternalSubscription's own keyId scheme) and already have a
 * purpose-built native-purchase relationship resolver
 * (resolveNativeMetadataRelationship in external-payment-sync-service.ts,
 * keyed on `courseCharge`/`offerCharge` metadata.kind — built but never
 * actually wired into a live webhook path until this fix). Option B would
 * mean the read layer forever needs to know about two ledger shapes and
 * two reconciliation states; Option A means MyMagnetix Purchases stays a
 * single, simple read against one ledger, exactly as already built, for
 * every purchase origin (native, imported, or future ones) — the smaller,
 * less duplicative, and more future-proof choice.
 *
 * This file provides the two call sites native purchase flows need
 * (initial purchase, ongoing lifecycle status) — both best-effort: a sync
 * failure here must never turn a successful purchase into a failed one,
 * matching this codebase's established "reconciliation blip must not block
 * the real transaction" contract (see person-identity-service.ts's
 * identical reasoning for ensurePersonLinkForMember).
 */

function normalizeSubscriptionStatus(
  value: Stripe.Subscription.Status
): ExternalSubscriptionStatus {
  switch (value) {
    case "active":
    case "trialing":
    case "past_due":
    case "paused":
    case "canceled":
      return value;
    default:
      // Stripe's "unpaid" / "incomplete" / "incomplete_expired" have no
      // exact match in our narrower vocabulary — same tolerant fallback
      // external-billing-import-service.ts's own normalizer already uses
      // for anything it doesn't recognize, not a new decision made here.
      return "unknown";
  }
}

function requestOptions(
  connectAccountId: string | null
): Stripe.RequestOptions | undefined {
  return connectAccountId ? { stripeAccount: connectAccountId } : undefined;
}

function isLiveProduct(
  product: string | Stripe.Product | Stripe.DeletedProduct | null | undefined
): product is Stripe.Product {
  return !!product && typeof product !== "string" && !product.deleted;
}

function isLiveCustomer(
  customer: string | Stripe.Customer | Stripe.DeletedCustomer
): customer is Stripe.Customer {
  return typeof customer !== "string" && !customer.deleted;
}

interface SubscriptionUpsertShared {
  agencyId: string;
  subAccountId: string;
  memberId: string;
  contactId: string;
  personId: string | null;
  stripeConnectAccountId: string | null;
  fallbackProductName: string | null;
}

async function upsertSubscriptionDoc(
  input: SubscriptionUpsertShared & {
    subscription: Stripe.Subscription;
    externalBillingCustomerId: string;
    externalCustomerId: string;
  }
): Promise<void> {
  const { subscription } = input;
  const item = subscription.items.data[0];
  const price = item?.price;
  const product = isLiveProduct(price?.product) ? price.product : null;
  const providerAccountId = input.stripeConnectAccountId ?? "platform";

  await upsertExternalSubscription({
    agencyId: input.agencyId,
    subAccountId: input.subAccountId,
    provider: "stripe",
    providerAccountId,
    externalCustomerId: input.externalCustomerId,
    externalSubscriptionId: subscription.id,
    externalBillingCustomerId: input.externalBillingCustomerId,
    contactId: input.contactId,
    personId: input.personId,
    memberId: input.memberId,
    externalProductId: product?.id ?? null,
    externalPriceId: price?.id ?? null,
    productName: product?.name ?? input.fallbackProductName,
    priceName: price?.nickname ?? null,
    amountCents: price?.unit_amount ?? null,
    currency: price?.currency ?? subscription.currency ?? null,
    interval: price?.recurring?.interval ?? null,
    intervalCount: price?.recurring?.interval_count ?? null,
    status: normalizeSubscriptionStatus(subscription.status),
    providerStatus: subscription.status,
    currentPeriodStart: item?.current_period_start
      ? new Date(item.current_period_start * 1000)
      : null,
    currentPeriodEnd: item?.current_period_end
      ? new Date(item.current_period_end * 1000)
      : null,
    cancelAtPeriodEnd: subscription.cancel_at_period_end === true,
    canceledAt: subscription.canceled_at
      ? new Date(subscription.canceled_at * 1000)
      : null,
    endedAt: subscription.ended_at
      ? new Date(subscription.ended_at * 1000)
      : null,
    trialStart: subscription.trial_start
      ? new Date(subscription.trial_start * 1000)
      : null,
    trialEnd: subscription.trial_end
      ? new Date(subscription.trial_end * 1000)
      : null,
    source: "synced",
    importedAt: null,
    importedByUid: null,
    lastProviderEventCreatedAt: null,
    metadata: subscription.metadata ?? null,
  });
}

/**
 * Syncs one native recurring subscription (Course Offer or Standalone
 * Course) into the customer-facing ledger, then seeds its most recent
 * invoice as a payment record too — so "Current subscriptions" AND the
 * first Payment History row both appear the instant checkout completes,
 * with no dependency on any additional Stripe webhook subscription (the
 * checkout.session.completed event this runs from is already live).
 * Ongoing lifecycle updates (renewals, past_due, cancellation) are kept
 * current by syncNativeSubscriptionStatusServerSide, triggered by
 * customer.subscription.updated/.deleted — already-subscribed events.
 *
 * Expands the real Stripe Customer here (never possible from a webhook
 * payload) so the billing-customer record gets the buyer's real name/email
 * once, at the one point this file has it — see
 * syncNativeSubscriptionStatusServerSide's own doc comment for why later
 * status-only updates deliberately never re-touch this record.
 */
export async function syncNativeSubscriptionPurchaseServerSide(
  input: SubscriptionUpsertShared & {
    /** Guaranteed-non-empty fallback if Stripe's Customer object somehow
     *  has no email set — upsertExternalBillingCustomer requires one. */
    memberEmail: string;
    stripeSubscriptionId: string;
  }
): Promise<void> {
  try {
    const stripe = getStripeServer();
    const opts = requestOptions(input.stripeConnectAccountId);
    const subscription = await stripe.subscriptions.retrieve(
      input.stripeSubscriptionId,
      { expand: ["items.data.price.product", "latest_invoice", "customer"] },
      opts
    );
    const liveCustomer = isLiveCustomer(subscription.customer)
      ? subscription.customer
      : null;
    const externalCustomerId = liveCustomer
      ? liveCustomer.id
      : (subscription.customer as string);
    const providerAccountId = input.stripeConnectAccountId ?? "platform";

    const customer = await upsertExternalBillingCustomer({
      agencyId: input.agencyId,
      subAccountId: input.subAccountId,
      provider: "stripe",
      providerAccountId,
      externalCustomerId,
      contactId: input.contactId,
      personId: input.personId,
      memberId: input.memberId,
      email: liveCustomer?.email || input.memberEmail,
      name: liveCustomer?.name ?? null,
      status: "active",
      source: "synced",
      importedAt: null,
      importedByUid: null,
    });

    await upsertSubscriptionDoc({
      ...input,
      subscription,
      externalBillingCustomerId: customer.id,
      externalCustomerId,
    });

    const invoice = subscription.latest_invoice;
    if (invoice && typeof invoice !== "string" && invoice.status === "paid") {
      await syncExternalStripeInvoicePayment({
        invoice,
        eventAccountId: input.stripeConnectAccountId,
        eventCreated: invoice.status_transitions?.paid_at ?? invoice.created,
        outcome: "succeeded",
        source: "synced",
      });
    }
  } catch (err) {
    console.warn(
      "[native-purchase-billing-sync] subscription purchase sync failed",
      err
    );
  }
}

/**
 * One-time (non-recurring) native purchase -> ledger sync. Unlike the
 * subscription path, this needs no new billing-customer/subscription
 * record at all: `syncExternalStripePaymentIntent` already resolves the
 * Person/Member/Contact relationship purely from the PaymentIntent's own
 * metadata (courseCharge/offerCharge kind + subAccountId/memberId, set at
 * checkout-creation time — see resolveNativeMetadataRelationship in
 * external-payment-sync-service.ts) with zero dependency on any other
 * ledger doc existing first. This is just a thin, best-effort wrapper so
 * every native-purchase call site in this codebase follows the same
 * "never let a sync failure block the real purchase" contract.
 */
export async function syncNativeOneTimePurchaseServerSide(input: {
  stripePaymentIntentId: string;
  stripeConnectAccountId: string | null;
}): Promise<void> {
  try {
    const stripe = getStripeServer();
    const paymentIntent = await stripe.paymentIntents.retrieve(
      input.stripePaymentIntentId,
      requestOptions(input.stripeConnectAccountId)
    );
    await syncExternalStripePaymentIntent({
      paymentIntent,
      eventAccountId: input.stripeConnectAccountId,
      eventCreated: paymentIntent.created,
      outcome: "succeeded",
    });
  } catch (err) {
    console.warn(
      "[native-purchase-billing-sync] one-time purchase sync failed",
      err
    );
  }
}

/**
 * Keeps an already-ledgered native subscription's status/period/
 * cancel-at-period-end current as Stripe reports changes — called from
 * customer.subscription.updated and .deleted, both already-subscribed
 * webhook events. Accepts the subscription object the webhook handler
 * already has — no extra Stripe API call needed here.
 *
 * Deliberately does NOT touch the billing customer's email/name: a
 * webhook payload's `subscription.customer` is always a bare string id
 * (Stripe never expands relations in webhook payloads), so re-upserting
 * the customer here would silently overwrite the real name/email
 * syncNativeSubscriptionPurchaseServerSide already captured with nothing
 * useful. Looks up the existing billing-customer id instead; only
 * upserts a (fallback, name-less) customer record if the initial
 * purchase sync somehow never ran for this subscription — degraded but
 * safe, never a crash.
 */
export async function syncNativeSubscriptionStatusServerSide(
  input: SubscriptionUpsertShared & {
    memberEmail: string;
    subscription: Stripe.Subscription;
  }
): Promise<void> {
  try {
    const { subscription } = input;
    const externalCustomerId =
      typeof subscription.customer === "string"
        ? subscription.customer
        : subscription.customer.id;
    const providerAccountId = input.stripeConnectAccountId ?? "platform";

    const existingCustomer =
      await findExternalBillingCustomerByProviderCustomer({
        subAccountId: input.subAccountId,
        provider: "stripe",
        providerAccountId,
        externalCustomerId,
      });
    const externalBillingCustomerId =
      existingCustomer?.id ??
      (
        await upsertExternalBillingCustomer({
          agencyId: input.agencyId,
          subAccountId: input.subAccountId,
          provider: "stripe",
          providerAccountId,
          externalCustomerId,
          contactId: input.contactId,
          personId: input.personId,
          memberId: input.memberId,
          email: input.memberEmail,
          name: null,
          status: "active",
          source: "synced",
          importedAt: null,
          importedByUid: null,
        })
      ).id;

    await upsertSubscriptionDoc({
      ...input,
      externalBillingCustomerId,
      externalCustomerId,
    });
  } catch (err) {
    console.warn(
      "[native-purchase-billing-sync] subscription status sync failed",
      err
    );
  }
}
