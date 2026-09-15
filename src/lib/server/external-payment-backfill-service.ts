import "server-only";

import type Stripe from "stripe";
import { getAdminDb } from "@/lib/firebase/admin";
import {
  getExternalBillingCustomerById,
  getExternalSubscriptionById,
} from "@/lib/server/external-billing-service";
import { findExternalPaymentByProviderPayment } from "@/lib/server/external-payment-service";
import {
  syncExternalStripeInvoicePayment,
  type ExternalPaymentRelationship,
} from "@/lib/server/external-payment-sync-service";
import {
  getStripeConnectionForEnvironment,
  getStripeEnvironment,
  getStripeServer,
} from "@/lib/stripe/server";
import type { ExternalSubscription } from "@/types/external-billing";

const HISTORY_WINDOW_DAYS = 730;
const MAX_INVOICES_PER_RUN = 250;
const STRIPE_PAGE_SIZE = 100;

export class ExternalPaymentBackfillError extends Error {
  constructor(
    message: string,
    readonly status: number = 400,
    readonly code: string = "PAYMENT_BACKFILL_FAILED"
  ) {
    super(message);
  }
}

export interface ExternalPaymentBackfillSummary {
  externalSubscriptionRecordId: string;
  examined: number;
  created: number;
  updated: number;
  skipped: number;
  errors: number;
  limitReached: boolean;
  windowStartedAt: string;
}

function stripeOptions(providerAccountId: string): Stripe.RequestOptions {
  return { stripeAccount: providerAccountId };
}

function objectId(
  value: string | { id: string } | null | undefined
): string | null {
  return typeof value === "string" ? value : (value?.id ?? null);
}

function subscriptionId(invoice: Stripe.Invoice): string | null {
  const parent = invoice.parent?.subscription_details;
  return parent ? objectId(parent.subscription) : null;
}

function historicalOutcome(
  invoice: Stripe.Invoice
): "succeeded" | "failed" | null {
  if (invoice.status === "paid") return "succeeded";
  if (
    (invoice.status === "open" || invoice.status === "uncollectible") &&
    invoice.attempted
  ) {
    return "failed";
  }
  return null;
}

function relationshipFromSubscription(
  subscription: ExternalSubscription
): ExternalPaymentRelationship {
  return {
    agencyId: subscription.agencyId,
    subAccountId: subscription.subAccountId,
    contactId: subscription.contactId,
    memberId: subscription.memberId,
    personId: subscription.personId,
    externalBillingCustomerId: subscription.externalBillingCustomerId,
    externalSubscriptionRecordId: subscription.id,
  };
}

async function assertBackfillRelationship(
  subAccountId: string,
  externalSubscriptionRecordId: string
): Promise<ExternalSubscription> {
  const subscription = await getExternalSubscriptionById(
    subAccountId,
    externalSubscriptionRecordId
  );
  if (!subscription) {
    throw new ExternalPaymentBackfillError(
      "Imported Stripe subscription not found in this sub-account.",
      404,
      "SUBSCRIPTION_NOT_FOUND"
    );
  }
  if (subscription.provider !== "stripe") {
    throw new ExternalPaymentBackfillError(
      "Historical payment backfill currently supports Stripe subscriptions only.",
      400,
      "UNSUPPORTED_PROVIDER"
    );
  }

  const [subAccountSnap, billingCustomer] = await Promise.all([
    getAdminDb().doc(`subAccounts/${subAccountId}`).get(),
    getExternalBillingCustomerById(
      subAccountId,
      subscription.externalBillingCustomerId
    ),
  ]);
  const currentConnectAccount = getStripeConnectionForEnvironment(
    subAccountSnap.data()?.stripeConnect,
    getStripeEnvironment()
  )?.accountId;
  if (
    !subAccountSnap.exists ||
    subAccountSnap.data()?.agencyId !== subscription.agencyId ||
    currentConnectAccount !== subscription.providerAccountId
  ) {
    throw new ExternalPaymentBackfillError(
      "The imported subscription no longer matches this sub-account's connected Stripe account.",
      409,
      "CONNECTED_ACCOUNT_MISMATCH"
    );
  }
  if (
    !billingCustomer ||
    billingCustomer.agencyId !== subscription.agencyId ||
    billingCustomer.subAccountId !== subscription.subAccountId ||
    billingCustomer.provider !== "stripe" ||
    billingCustomer.providerAccountId !== subscription.providerAccountId ||
    billingCustomer.externalCustomerId !== subscription.externalCustomerId ||
    billingCustomer.contactId !== subscription.contactId
  ) {
    throw new ExternalPaymentBackfillError(
      "The imported Stripe customer relationship no longer matches this subscription.",
      409,
      "BILLING_CUSTOMER_MISMATCH"
    );
  }
  return subscription;
}

async function invoiceCharge(
  invoice: Stripe.Invoice,
  providerAccountId: string,
  environment: "test" | "live"
): Promise<Stripe.Charge | null> {
  const stripe = getStripeServer(environment);
  const payments = await stripe.invoicePayments.list(
    { invoice: invoice.id, limit: 10 },
    stripeOptions(providerAccountId)
  );
  const payment =
    payments.data.find((entry) => entry.status === "paid") ?? payments.data[0];
  const paymentIntentId = payment
    ? objectId(payment.payment.payment_intent)
    : null;
  const directChargeId = payment ? objectId(payment.payment.charge) : null;
  const chargeId = paymentIntentId
    ? objectId(
        (
          await stripe.paymentIntents.retrieve(
            paymentIntentId,
            stripeOptions(providerAccountId)
          )
        ).latest_charge
      )
    : directChargeId;
  return chargeId
    ? stripe.charges.retrieve(chargeId, stripeOptions(providerAccountId))
    : null;
}

/**
 * Bounded, read-only Stripe history import for one already-linked external
 * subscription. It deliberately derives all provider and Magnetix identity
 * fields from that verified record rather than accepting browser input.
 */
export async function backfillStripePaymentsForExternalSubscription(input: {
  subAccountId: string;
  externalSubscriptionRecordId: string;
}): Promise<ExternalPaymentBackfillSummary> {
  const subscription = await assertBackfillRelationship(
    input.subAccountId,
    input.externalSubscriptionRecordId
  );
  const windowStartedAt = new Date(
    Date.now() - HISTORY_WINDOW_DAYS * 24 * 60 * 60 * 1000
  );
  const createdAtGte = Math.floor(windowStartedAt.getTime() / 1000);
  const relationship = relationshipFromSubscription(subscription);
  const stripe = getStripeServer(
    subscription.providerEnvironment ?? getStripeEnvironment()
  );
  const options = stripeOptions(subscription.providerAccountId);
  const summary: ExternalPaymentBackfillSummary = {
    externalSubscriptionRecordId: subscription.id,
    examined: 0,
    created: 0,
    updated: 0,
    skipped: 0,
    errors: 0,
    limitReached: false,
    windowStartedAt: windowStartedAt.toISOString(),
  };

  let startingAfter: string | undefined;
  while (summary.examined < MAX_INVOICES_PER_RUN) {
    const remaining = MAX_INVOICES_PER_RUN - summary.examined;
    const page = await stripe.invoices.list(
      {
        customer: subscription.externalCustomerId,
        subscription: subscription.externalSubscriptionId,
        created: { gte: createdAtGte },
        limit: Math.min(STRIPE_PAGE_SIZE, remaining),
        ...(startingAfter ? { starting_after: startingAfter } : {}),
      },
      options
    );
    if (page.data.length === 0) break;

    for (const invoice of page.data) {
      if (summary.examined >= MAX_INVOICES_PER_RUN) {
        summary.limitReached = true;
        break;
      }
      summary.examined += 1;
      // Keep the query defense-in-depth: a customer match alone is never
      // enough to attach unrelated subscription or one-time invoices.
      if (
        objectId(invoice.customer) !== subscription.externalCustomerId ||
        subscriptionId(invoice) !== subscription.externalSubscriptionId
      ) {
        summary.skipped += 1;
        continue;
      }
      const outcome = historicalOutcome(invoice);
      if (!outcome) {
        summary.skipped += 1;
        continue;
      }

      try {
        const existing = await findExternalPaymentByProviderPayment({
          subAccountId: subscription.subAccountId,
          provider: "stripe",
          providerAccountId: subscription.providerAccountId,
          externalPaymentId: invoice.id,
        });
        let charge: Stripe.Charge | null = null;
        if (outcome === "succeeded") {
          try {
            charge = await invoiceCharge(
              invoice,
              subscription.providerAccountId,
              subscription.providerEnvironment ?? getStripeEnvironment()
            );
          } catch (error) {
            // Refund/receipt enrichment is optional. The verified invoice is
            // sufficient to backfill the canonical payment record.
            console.warn(
              `[external-payment-backfill] charge enrichment skipped subscription=${subscription.id} invoice=${invoice.id} reason=${error instanceof Error ? error.message : "Unknown error"}`
            );
          }
        }
        const syncResult = await syncExternalStripeInvoicePayment({
          invoice,
          eventAccountId: subscription.providerAccountId,
          eventCreated: null,
          outcome: charge && charge.amount_refunded > 0 ? "refunded" : outcome,
          charge,
          relationship,
          source: "historical_backfill",
        });
        if (syncResult.outcome === "no_match") {
          summary.skipped += 1;
        } else if (existing) {
          summary.updated += 1;
        } else {
          summary.created += 1;
        }
      } catch (error) {
        summary.errors += 1;
        console.warn(
          `[external-payment-backfill] invoice skipped subscription=${subscription.id} invoice=${invoice.id} reason=${error instanceof Error ? error.message : "Unknown error"}`
        );
      }
    }

    if (!page.has_more || summary.limitReached) break;
    startingAfter = page.data[page.data.length - 1]?.id;
    if (!startingAfter) break;
  }
  return summary;
}
