import "server-only";

import type Stripe from "stripe";
import { getAdminDb } from "@/lib/firebase/admin";
import { findExternalSubscriptionByProviderAccountSubscription } from "@/lib/server/external-billing-service";
import {
  findExternalPaymentByProviderCharge,
  upsertExternalPayment,
  type UpsertExternalPaymentInput,
} from "@/lib/server/external-payment-service";
import {
  getStripeConnectionForEnvironment,
  getStripeEnvironment,
  getStripeServer,
} from "@/lib/stripe/server";
import type { ExternalPayment } from "@/types/external-billing";

const PLATFORM_PROVIDER_ACCOUNT_ID = "platform";
const NATIVE_PAYMENT_KINDS = new Set(["courseCharge", "offerCharge"]);

type PaymentOutcome = "succeeded" | "failed" | "refunded";

export type ExternalPaymentSyncResult =
  | { outcome: "no_match"; externalPaymentId: string }
  | { outcome: "updated"; externalPaymentId: string; recordId: string }
  | { outcome: "stale"; externalPaymentId: string; recordId: string };

export interface ExternalPaymentRelationship {
  agencyId: string;
  subAccountId: string;
  contactId: string;
  memberId: string | null;
  personId: string | null;
  externalBillingCustomerId: string | null;
  externalSubscriptionRecordId: string | null;
}

function objectId(
  value: string | { id: string } | null | undefined
): string | null {
  if (typeof value === "string") return value;
  return value?.id ?? null;
}

function dateFromUnix(value: number | null | undefined): Date | null {
  return typeof value === "number" ? new Date(value * 1000) : null;
}

function providerAccountId(eventAccountId: string | null): string {
  return eventAccountId?.trim() || PLATFORM_PROVIDER_ACCOUNT_ID;
}

function requestOptions(
  eventAccountId: string | null
): Stripe.RequestOptions | undefined {
  return eventAccountId?.trim()
    ? { stripeAccount: eventAccountId.trim() }
    : undefined;
}

function invoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  const parent = invoice.parent?.subscription_details;
  return parent ? objectId(parent.subscription) : null;
}

function invoiceMetadata(invoice: Stripe.Invoice): Stripe.Metadata | null {
  return invoice.parent?.subscription_details?.metadata ?? invoice.metadata;
}

function firstInvoiceDescription(invoice: Stripe.Invoice): string | null {
  return invoice.lines.data[0]?.description ?? null;
}

function chargeRefundedAt(
  charge: Stripe.Charge | null | undefined
): Date | null {
  const created = charge?.refunds?.data.reduce<number | null>(
    (latest, refund) =>
      latest === null || refund.created > latest ? refund.created : latest,
    null
  );
  return dateFromUnix(created);
}

function failureFromPaymentIntent(paymentIntent: Stripe.PaymentIntent | null): {
  code: string | null;
  message: string | null;
} {
  const error = paymentIntent?.last_payment_error;
  return {
    code: error?.code ?? error?.decline_code ?? null,
    message: error?.message ?? null,
  };
}

async function resolveImportedSubscriptionRelationship(input: {
  eventAccountId: string | null;
  externalSubscriptionId: string | null;
}): Promise<ExternalPaymentRelationship | null> {
  if (!input.eventAccountId?.trim() || !input.externalSubscriptionId)
    return null;
  const subscription =
    await findExternalSubscriptionByProviderAccountSubscription({
      provider: "stripe",
      providerAccountId: input.eventAccountId.trim(),
      externalSubscriptionId: input.externalSubscriptionId,
    });
  if (!subscription) return null;
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

async function resolveNativeMetadataRelationship(input: {
  metadata: Stripe.Metadata | null;
  eventAccountId: string | null;
}): Promise<ExternalPaymentRelationship | null> {
  const metadata = input.metadata;
  if (!metadata || !NATIVE_PAYMENT_KINDS.has(metadata.kind ?? "")) return null;
  const subAccountId = metadata.subAccountId?.trim();
  const memberId = metadata.memberId?.trim();
  if (!subAccountId || !memberId) return null;

  const db = getAdminDb();
  const [subAccountSnap, memberSnap] = await Promise.all([
    db.doc(`subAccounts/${subAccountId}`).get(),
    db.doc(`subAccounts/${subAccountId}/members/${memberId}`).get(),
  ]);
  const subAccount = subAccountSnap.data();
  const member = memberSnap.data();
  const agencyId = subAccount?.agencyId;
  const contactId = member?.contactId;
  const connectedAccountId = getStripeConnectionForEnvironment(
    subAccount?.stripeConnect,
    getStripeEnvironment()
  )?.accountId;
  if (
    !subAccountSnap.exists ||
    !memberSnap.exists ||
    typeof agencyId !== "string" ||
    !agencyId ||
    typeof contactId !== "string" ||
    !contactId
  ) {
    return null;
  }

  // The verified event account must agree with the tenant's Stripe boundary.
  // A platform event is only valid for the explicit shared-account exception.
  if (input.eventAccountId?.trim()) {
    if (connectedAccountId !== input.eventAccountId.trim()) return null;
  } else if (
    connectedAccountId &&
    subAccount?.stripeCourseCheckoutEnabledByAgency !== true
  ) {
    return null;
  }

  const contactSnap = await db.doc(`contacts/${contactId}`).get();
  if (
    !contactSnap.exists ||
    contactSnap.data()?.subAccountId !== subAccountId
  ) {
    return null;
  }
  return {
    agencyId,
    subAccountId,
    contactId,
    memberId,
    personId: typeof member?.personId === "string" ? member.personId : null,
    externalBillingCustomerId: null,
    externalSubscriptionRecordId: null,
  };
}

async function resolveRelationship(input: {
  eventAccountId: string | null;
  externalSubscriptionId: string | null;
  metadata: Stripe.Metadata | null;
}): Promise<ExternalPaymentRelationship | null> {
  const imported = await resolveImportedSubscriptionRelationship({
    eventAccountId: input.eventAccountId,
    externalSubscriptionId: input.externalSubscriptionId,
  });
  if (imported) return imported;
  return resolveNativeMetadataRelationship({
    metadata: input.metadata,
    eventAccountId: input.eventAccountId,
  });
}

async function invoicePaymentReferences(input: {
  invoice: Stripe.Invoice;
  eventAccountId: string | null;
}): Promise<{ paymentIntentId: string | null; chargeId: string | null }> {
  const stripe = getStripeServer();
  const payments = await stripe.invoicePayments.list(
    { invoice: input.invoice.id, limit: 10 },
    requestOptions(input.eventAccountId)
  );
  const payment =
    payments.data.find((entry) => entry.status === "paid") ?? payments.data[0];
  if (!payment) return { paymentIntentId: null, chargeId: null };
  return {
    paymentIntentId: objectId(payment.payment.payment_intent),
    chargeId: objectId(payment.payment.charge),
  };
}

async function invoiceForPaymentIntent(input: {
  paymentIntentId: string;
  eventAccountId: string | null;
}): Promise<Stripe.Invoice | null> {
  const stripe = getStripeServer();
  const payments = await stripe.invoicePayments.list(
    {
      payment: {
        type: "payment_intent",
        payment_intent: input.paymentIntentId,
      },
      limit: 2,
    },
    requestOptions(input.eventAccountId)
  );
  if (payments.data.length !== 1) return null;
  const invoiceId = objectId(payments.data[0].invoice);
  if (!invoiceId) return null;
  return stripe.invoices.retrieve(
    invoiceId,
    requestOptions(input.eventAccountId)
  );
}

function resultFromPayment(
  payment: ExternalPayment,
  eventCreated: number | null,
  externalPaymentId: string
): ExternalPaymentSyncResult {
  return eventCreated !== null &&
    payment.lastProviderEventCreatedAt !== null &&
    payment.lastProviderEventCreatedAt > eventCreated
    ? { outcome: "stale", externalPaymentId, recordId: payment.id }
    : { outcome: "updated", externalPaymentId, recordId: payment.id };
}

async function upsertResolvedPayment(input: {
  relationship: ExternalPaymentRelationship;
  eventAccountId: string | null;
  eventCreated: number | null;
  source: "synced" | "historical_backfill";
  payment: Omit<
    UpsertExternalPaymentInput,
    | "agencyId"
    | "subAccountId"
    | "contactId"
    | "memberId"
    | "personId"
    | "externalBillingCustomerId"
    | "externalSubscriptionRecordId"
    | "provider"
    | "providerAccountId"
    | "lastProviderEventCreatedAt"
  >;
}): Promise<ExternalPaymentSyncResult> {
  const saved = await upsertExternalPayment({
    ...input.payment,
    agencyId: input.relationship.agencyId,
    subAccountId: input.relationship.subAccountId,
    provider: "stripe",
    providerAccountId: providerAccountId(input.eventAccountId),
    externalBillingCustomerId: input.relationship.externalBillingCustomerId,
    externalSubscriptionRecordId:
      input.relationship.externalSubscriptionRecordId,
    contactId: input.relationship.contactId,
    memberId: input.relationship.memberId,
    personId: input.relationship.personId,
    lastProviderEventCreatedAt: input.eventCreated,
    source: input.source,
  });
  return resultFromPayment(
    saved,
    input.eventCreated,
    input.payment.externalPaymentId
  );
}

export async function syncExternalStripeInvoicePayment(input: {
  invoice: Stripe.Invoice;
  eventAccountId: string | null;
  eventCreated: number | null;
  outcome: PaymentOutcome;
  paymentIntent?: Stripe.PaymentIntent | null;
  charge?: Stripe.Charge | null;
  relationship?: ExternalPaymentRelationship;
  source?: "synced" | "historical_backfill";
}): Promise<ExternalPaymentSyncResult> {
  const externalSubscriptionId = invoiceSubscriptionId(input.invoice);
  const relationship =
    input.relationship ??
    (await resolveRelationship({
      eventAccountId: input.eventAccountId,
      externalSubscriptionId,
      metadata: invoiceMetadata(input.invoice),
    }));
  if (!relationship) {
    return { outcome: "no_match", externalPaymentId: input.invoice.id };
  }

  const references = await invoicePaymentReferences({
    invoice: input.invoice,
    eventAccountId: input.eventAccountId,
  }).catch((error) => {
    console.warn(
      `[external-payment-sync] invoice payment references unavailable invoice=${input.invoice.id} reason=${error instanceof Error ? error.message : "Unknown error"}`
    );
    return { paymentIntentId: null, chargeId: null };
  });
  const paymentIntent =
    input.paymentIntent ??
    (input.outcome === "failed" && references.paymentIntentId
      ? await getStripeServer().paymentIntents.retrieve(
          references.paymentIntentId,
          requestOptions(input.eventAccountId)
        )
      : null);
  const failure = failureFromPaymentIntent(paymentIntent);
  const amountCents =
    input.outcome === "failed"
      ? input.invoice.amount_due
      : input.invoice.amount_paid || input.invoice.amount_due;
  const refundedCents = input.charge?.amount_refunded ?? 0;
  const fullyRefunded =
    input.outcome === "refunded" && refundedCents >= amountCents;

  return upsertResolvedPayment({
    relationship,
    eventAccountId: input.eventAccountId,
    eventCreated: input.eventCreated,
    source: input.source ?? "synced",
    payment: {
      externalPaymentId: input.invoice.id,
      externalCustomerId: objectId(input.invoice.customer),
      externalSubscriptionId,
      externalInvoiceId: input.invoice.id,
      externalChargeId: input.charge?.id ?? references.chargeId,
      externalPaymentIntentId: paymentIntent?.id ?? references.paymentIntentId,
      productName: firstInvoiceDescription(input.invoice),
      description: firstInvoiceDescription(input.invoice),
      amountCents,
      amountRefundedCents: refundedCents,
      currency: input.invoice.currency,
      status:
        input.outcome === "succeeded"
          ? "succeeded"
          : input.outcome === "failed"
            ? "failed"
            : fullyRefunded
              ? "refunded"
              : "partially_refunded",
      providerStatus: input.invoice.status ?? input.outcome,
      paymentType: externalSubscriptionId ? "subscription" : "invoice",
      occurredAt: dateFromUnix(input.invoice.created),
      paidAt:
        input.outcome === "succeeded" || input.outcome === "refunded"
          ? (dateFromUnix(input.invoice.status_transitions.paid_at) ??
            dateFromUnix(input.invoice.created))
          : null,
      failedAt:
        input.outcome === "failed"
          ? (dateFromUnix(input.eventCreated) ??
            dateFromUnix(input.invoice.status_transitions.finalized_at) ??
            dateFromUnix(input.invoice.created))
          : null,
      refundedAt:
        input.outcome === "refunded"
          ? (dateFromUnix(input.eventCreated) ?? chargeRefundedAt(input.charge))
          : null,
      receiptUrl: input.charge?.receipt_url ?? null,
      invoiceHostedUrl: input.invoice.hosted_invoice_url ?? null,
      invoicePdfUrl: input.invoice.invoice_pdf ?? null,
      failureCode: input.outcome === "failed" ? failure.code : null,
      failureMessage: input.outcome === "failed" ? failure.message : null,
      source: "synced",
      metadata: null,
    },
  });
}

export async function syncExternalStripePaymentIntent(input: {
  paymentIntent: Stripe.PaymentIntent;
  eventAccountId: string | null;
  eventCreated: number;
  outcome: Exclude<PaymentOutcome, "refunded">;
}): Promise<ExternalPaymentSyncResult> {
  const invoice = await invoiceForPaymentIntent({
    paymentIntentId: input.paymentIntent.id,
    eventAccountId: input.eventAccountId,
  });
  if (invoice) {
    return syncExternalStripeInvoicePayment({
      invoice,
      eventAccountId: input.eventAccountId,
      eventCreated: input.eventCreated,
      outcome: input.outcome,
      paymentIntent: input.paymentIntent,
    });
  }

  const relationship = await resolveRelationship({
    eventAccountId: input.eventAccountId,
    externalSubscriptionId: null,
    metadata: input.paymentIntent.metadata,
  });
  if (!relationship) {
    return { outcome: "no_match", externalPaymentId: input.paymentIntent.id };
  }
  const failure = failureFromPaymentIntent(input.paymentIntent);
  return upsertResolvedPayment({
    relationship,
    eventAccountId: input.eventAccountId,
    eventCreated: input.eventCreated,
    source: "synced",
    payment: {
      externalPaymentId: input.paymentIntent.id,
      externalCustomerId: objectId(input.paymentIntent.customer),
      externalSubscriptionId: null,
      externalInvoiceId: null,
      externalChargeId: objectId(input.paymentIntent.latest_charge),
      externalPaymentIntentId: input.paymentIntent.id,
      productName: input.paymentIntent.description,
      description: input.paymentIntent.description,
      amountCents:
        input.outcome === "succeeded"
          ? input.paymentIntent.amount_received
          : input.paymentIntent.amount,
      amountRefundedCents: 0,
      currency: input.paymentIntent.currency,
      status: input.outcome === "succeeded" ? "succeeded" : "failed",
      providerStatus: input.paymentIntent.status,
      paymentType: "one_time",
      occurredAt: dateFromUnix(input.paymentIntent.created),
      paidAt:
        input.outcome === "succeeded" ? dateFromUnix(input.eventCreated) : null,
      failedAt:
        input.outcome === "failed" ? dateFromUnix(input.eventCreated) : null,
      refundedAt: null,
      receiptUrl: null,
      invoiceHostedUrl: null,
      invoicePdfUrl: null,
      failureCode: input.outcome === "failed" ? failure.code : null,
      failureMessage: input.outcome === "failed" ? failure.message : null,
      source: "synced",
      metadata: null,
    },
  });
}

export async function syncExternalStripeChargeRefund(input: {
  charge: Stripe.Charge;
  eventAccountId: string | null;
  eventCreated: number;
}): Promise<ExternalPaymentSyncResult> {
  const paymentIntentId = objectId(input.charge.payment_intent);
  if (paymentIntentId) {
    const invoice = await invoiceForPaymentIntent({
      paymentIntentId,
      eventAccountId: input.eventAccountId,
    });
    if (invoice) {
      return syncExternalStripeInvoicePayment({
        invoice,
        eventAccountId: input.eventAccountId,
        eventCreated: input.eventCreated,
        outcome: "refunded",
        charge: input.charge,
      });
    }
  }

  const existing = await findExternalPaymentByProviderCharge({
    provider: "stripe",
    providerAccountId: providerAccountId(input.eventAccountId),
    externalChargeId: input.charge.id,
  });
  const relationship = existing
    ? {
        agencyId: existing.agencyId,
        subAccountId: existing.subAccountId,
        contactId: existing.contactId,
        memberId: existing.memberId,
        personId: existing.personId,
        externalBillingCustomerId: existing.externalBillingCustomerId,
        externalSubscriptionRecordId: existing.externalSubscriptionRecordId,
      }
    : await resolveRelationship({
        eventAccountId: input.eventAccountId,
        externalSubscriptionId: null,
        metadata: input.charge.metadata,
      });
  if (!relationship) {
    return { outcome: "no_match", externalPaymentId: input.charge.id };
  }

  const externalPaymentId =
    existing?.externalPaymentId ?? paymentIntentId ?? input.charge.id;
  const fullyRefunded =
    input.charge.refunded ||
    input.charge.amount_refunded >= input.charge.amount;
  return upsertResolvedPayment({
    relationship,
    eventAccountId: input.eventAccountId,
    eventCreated: input.eventCreated,
    source: "synced",
    payment: {
      externalPaymentId,
      externalCustomerId: objectId(input.charge.customer),
      externalSubscriptionId: null,
      externalInvoiceId: null,
      externalChargeId: input.charge.id,
      externalPaymentIntentId: paymentIntentId,
      productName: input.charge.description,
      description: input.charge.description,
      amountCents: input.charge.amount,
      amountRefundedCents: input.charge.amount_refunded,
      currency: input.charge.currency,
      status: fullyRefunded ? "refunded" : "partially_refunded",
      providerStatus: input.charge.status,
      paymentType: "one_time",
      occurredAt: dateFromUnix(input.charge.created),
      paidAt: dateFromUnix(input.charge.created),
      failedAt: null,
      refundedAt: dateFromUnix(input.eventCreated),
      receiptUrl: input.charge.receipt_url,
      invoiceHostedUrl: null,
      invoicePdfUrl: null,
      failureCode: null,
      failureMessage: null,
      source: "synced",
      metadata: null,
    },
  });
}
