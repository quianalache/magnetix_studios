import type { FieldValue, Timestamp } from "firebase/firestore";
import type { StripeEnvironment } from "@/types/tenancy";

/** Provider names are open-ended so adding a provider does not require a type redesign. */
export type ExternalBillingProvider = "stripe" | "paypal" | (string & {});

/** Source/provenance is intentionally open-ended for future sync/import paths. */
export type ExternalBillingSource =
  | "imported"
  | "synced"
  | "historical_backfill"
  | "manual"
  | (string & {});

export type ExternalBillingCustomerStatus = "active" | "archived" | "unknown";

/** Normalized lifecycle state; the original provider value is preserved separately. */
export type ExternalSubscriptionStatus =
  | "active"
  | "trialing"
  | "past_due"
  | "paused"
  | "canceled"
  | "ended"
  | "incomplete"
  | "unknown";

/** Normalized outcome of one provider-side monetary event. */
export type ExternalPaymentStatus =
  | "pending"
  | "succeeded"
  | "failed"
  | "refunded"
  | "partially_refunded"
  | "canceled"
  | "requires_action"
  | "unknown";

/** The billing context that produced a monetary event, independent of provider. */
export type ExternalPaymentType =
  | "subscription"
  | "one_time"
  | "invoice"
  | "other";

export type ExternalBillingTimestamp = Timestamp | FieldValue | Date | null;

export type ExternalBillingMetadata = Record<
  string,
  string | number | boolean | null
>;

/**
 * A provider customer identity linked to an existing Magnetix identity.
 * Stored at `externalBillingCustomers/{id}`.
 */
export interface ExternalBillingCustomer {
  id: string;
  agencyId: string;
  subAccountId: string;
  provider: ExternalBillingProvider;
  /** Stripe Connect account id, or the equivalent provider account boundary. */
  providerAccountId: string;
  providerEnvironment?: StripeEnvironment | null;
  externalCustomerId: string;
  contactId: string;
  personId: string | null;
  memberId: string | null;
  email: string;
  normalizedEmail: string;
  name: string | null;
  status: ExternalBillingCustomerStatus;
  source: ExternalBillingSource;
  importedAt: ExternalBillingTimestamp;
  importedByUid: string | null;
  createdAt: ExternalBillingTimestamp;
  updatedAt: ExternalBillingTimestamp;
}

/**
 * A recurring provider subscription kept independent from Magnetix purchases
 * and access records. Stored at `externalSubscriptions/{id}`.
 */
export interface ExternalSubscription {
  id: string;
  agencyId: string;
  subAccountId: string;
  provider: ExternalBillingProvider;
  providerAccountId: string;
  providerEnvironment?: StripeEnvironment | null;
  externalCustomerId: string;
  externalSubscriptionId: string;
  externalBillingCustomerId: string;
  contactId: string;
  personId: string | null;
  memberId: string | null;

  externalProductId: string | null;
  externalPriceId: string | null;
  productName: string | null;
  priceName: string | null;

  amountCents: number | null;
  currency: string | null;
  interval: string | null;
  intervalCount: number | null;

  status: ExternalSubscriptionStatus;
  providerStatus: string;
  currentPeriodStart: ExternalBillingTimestamp;
  currentPeriodEnd: ExternalBillingTimestamp;
  cancelAtPeriodEnd: boolean;
  canceledAt: ExternalBillingTimestamp;
  endedAt: ExternalBillingTimestamp;
  trialStart: ExternalBillingTimestamp;
  trialEnd: ExternalBillingTimestamp;

  source: ExternalBillingSource;
  importedAt: ExternalBillingTimestamp;
  importedByUid: string | null;
  /** Unix seconds from the last accepted Stripe webhook event. */
  lastProviderEventCreatedAt: number | null;
  metadata: ExternalBillingMetadata | null;
  createdAt: ExternalBillingTimestamp;
  updatedAt: ExternalBillingTimestamp;
}

/**
 * One provider-side monetary event, independent from purchases and access.
 * Stored at `externalPayments/{id}`. A subscription can have many payments;
 * a payment may be unlinked from a subscription for one-time billing.
 */
export interface ExternalPayment {
  id: string;
  agencyId: string;
  subAccountId: string;
  provider: ExternalBillingProvider;
  providerAccountId: string;

  /**
   * The provider adapter's canonical identity for one money movement. For
   * Stripe this will be an invoice id for invoice-backed payments and a
   * payment-intent id for standalone payments; related charge/refund events
   * update this same record rather than creating duplicates.
   */
  externalPaymentId: string;
  externalCustomerId: string | null;
  externalSubscriptionId: string | null;
  externalInvoiceId: string | null;
  externalChargeId: string | null;
  externalPaymentIntentId: string | null;

  externalBillingCustomerId: string | null;
  externalSubscriptionRecordId: string | null;
  contactId: string;
  memberId: string | null;
  personId: string | null;

  productName: string | null;
  description: string | null;
  amountCents: number;
  amountRefundedCents: number;
  /** Persisted derived amount: `amountCents - amountRefundedCents`. */
  netAmountCents: number;
  currency: string;

  status: ExternalPaymentStatus;
  providerStatus: string;
  paymentType: ExternalPaymentType;

  occurredAt: ExternalBillingTimestamp;
  paidAt: ExternalBillingTimestamp;
  failedAt: ExternalBillingTimestamp;
  refundedAt: ExternalBillingTimestamp;

  receiptUrl: string | null;
  invoiceHostedUrl: string | null;
  invoicePdfUrl: string | null;
  failureCode: string | null;
  failureMessage: string | null;

  source: ExternalBillingSource;
  /** Unix seconds from the newest accepted provider webhook event. */
  lastProviderEventCreatedAt: number | null;
  metadata: ExternalBillingMetadata | null;
  createdAt: ExternalBillingTimestamp;
  updatedAt: ExternalBillingTimestamp;
}
