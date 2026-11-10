import type { ServiceAgreementMode } from "./course-offers";
import type { RecurringInterval } from "./course-offers";

/**
 * Checkout Foundation — Phase 1 (2026-11).
 *
 * Shared types for the checkout engine that serves BOTH a Funnel Checkout
 * Step and an Offer's standalone hosted checkout. The Offer stays the
 * commercial source of truth (price, currency, billing type, interval,
 * trial, entitlements, payment mode). A checkout context only controls
 * presentation and behaviour: format, buyer fields, agreement, Order Bumps,
 * coupon acceptance and the post-purchase destination.
 *
 * Storage (all server-only — no Firestore rule, so default deny; every read
 * and write goes through tenancy-checked API routes):
 *   funnels/{funnelId}                       Funnel
 *   funnels/{funnelId}/steps/{stepId}        FunnelStep
 *   checkoutConfigs/{configId}               CheckoutConfig (one per context)
 *   checkoutOrders/{orderId}                 CheckoutOrder
 *   coupons/{couponId}                       Coupon
 *   couponCodes/{subAccountId}__{CODE}       uniqueness guard
 *   couponRedemptions/{orderId}              one redemption per paid order
 *   checkoutSessions/{sessionId}             CheckoutSession (Phase 3: start →
 *                                            abandoned / completed, CRM follow-up)
 */

/* --------------------------------- Funnels -------------------------------- */

export type FunnelStatus = "draft" | "published" | "archived";

export interface Funnel {
  id: string;
  agencyId: string;
  subAccountId: string;
  name: string;
  status: FunnelStatus;
  createdByUid: string;
  createdAt: number;
  updatedAt: number;
}

/**
 * A step's type. The sequence is user-defined: nothing forces
 * Sales → Checkout → Upsell → Thank You. Only `checkout` has a working
 * public experience in Phase 1; the others hold a page reference so the
 * future Funnel Workspace can route them.
 */
export type FunnelStepType = "page" | "checkout" | "upsell" | "downsell" | "thank_you";

export interface FunnelStep {
  id: string;
  funnelId: string;
  subAccountId: string;
  name: string;
  type: FunnelStepType;
  /** 0-based position; steps are always returned sorted by this. */
  order: number;
  /** Pages & Funnels page shown for this step (page/upsell/downsell/thank-you). */
  pageId: string | null;
  /** Checkout steps only: the step's checkout configuration. */
  checkoutConfigId: string | null;
  createdAt: number;
  updatedAt: number;
}

/* ----------------------------- Checkout config ---------------------------- */

export type CheckoutContext =
  | { type: "hosted_offer"; offerId: string }
  | { type: "funnel_step"; funnelId: string; stepId: string };

export type CheckoutFormat = "one_step" | "two_step";
export type BuyerNameFormat = "full" | "first_last";
export type PhoneRequirement = "hidden" | "optional" | "required";
/**
 * Billing address is collected by Stripe only — Magnetix never asks for it
 * itself. `auto` = whatever the payment method needs (usually country +
 * postal code); `full` = Stripe's Address Element in billing mode.
 */
export type BillingAddressMode = "auto" | "full";

export interface CheckoutAgreement {
  mode: ServiceAgreementMode;
  customText: string;
  linkUrl: string;
}

/**
 * An Order Bump inside ONE checkout context. Commercial truth (price,
 * currency, billing type, entitlements) always comes from the referenced
 * Offer; only presentation can be overridden here.
 */
export interface CheckoutBump {
  /** Stable id within the config (never reused). */
  id: string;
  offerId: string;
  enabled: boolean;
  headline: string;
  description: string;
  imageUrl: string;
  badge: string;
  checkboxLabel: string;
}

export interface CheckoutDisplay {
  headline: string;
  subheadline: string;
  showRecurringTerms: boolean;
  showTrialTiming: boolean;
  showDueToday: boolean;
  showEntitlements: boolean;
  guaranteeEnabled: boolean;
  guaranteeTitle: string;
  guaranteeText: string;
  /** "Secure checkout" line + card brand marks under the pay button. */
  showSecureBadge: boolean;
  submitLabel: string;
}

/**
 * Where the buyer goes after a successful purchase. Funnel-only variants
 * resolve against the funnel's own ordered steps.
 */
export type PostPurchaseDestination =
  | { type: "space" }
  | { type: "url"; url: string }
  | { type: "page"; pageId: string }
  | { type: "funnel_next_step" }
  | { type: "funnel_step"; stepId: string };

/**
 * CRM & Follow-Up (Checkout Foundation Phase 3). Business behaviour owned
 * by the checkout configuration — never by a Page Builder block. Tags are
 * the existing free-form Contact tags; Workflows are the existing
 * Workflows (picked directly, and every checkout event is also a Workflow
 * trigger). Marketing consent uses the Contact's existing `emailConsent`.
 */
export interface CheckoutCrmSettings {
  /** Create/update the Contact once the buyer deliberately starts checkout. */
  captureContactOnStart: boolean;
  startedTags: string[];
  marketingOptIn: {
    /** Show an UNCHECKED opt-in box. Purchase alone is never consent. */
    enabled: boolean;
    label: string;
    /** Tags applied only when the buyer ticks the box. */
    tags: string[];
  };
  abandoned: {
    enabled: boolean;
    /** Minutes after the buyer's last checkout activity. */
    delayMinutes: 30 | 60 | 240 | 1440;
    /** An existing Workflow to start for the Contact (optional). */
    workflowId: string | null;
    tags: string[];
  };
  completed: {
    tags: string[];
    /** Take the abandoned tags back off when the buyer completes. */
    removeAbandonedTags: boolean;
    workflowId: string | null;
  };
  /** Applied on a paid order that included at least one Order Bump. */
  bumpPurchasedTags: string[];
  /** Applied on a paid order that used a discount code. */
  couponUsedTags: string[];
}

export interface CheckoutConfig {
  id: string;
  agencyId: string;
  subAccountId: string;
  context: CheckoutContext;
  /** Exactly one primary Offer. Fixed to the Offer itself for hosted checkouts. */
  primaryOfferId: string | null;
  /** Hosted checkouts: when false the Offer keeps its original enroll modal. */
  enabled: boolean;
  format: CheckoutFormat;
  nameFormat: BuyerNameFormat;
  phone: PhoneRequirement;
  billingAddress: BillingAddressMode;
  agreement: CheckoutAgreement;
  couponsEnabled: boolean;
  bumps: CheckoutBump[];
  display: CheckoutDisplay;
  postPurchase: PostPurchaseDestination;
  internalNotes: string;
  /** Phase 3. Absent on older configs — read through normalizeCrm(). */
  crm: CheckoutCrmSettings;
  version: number;
  createdAt: number;
  updatedAt: number;
  updatedByUid: string | null;
}

/* --------------------------------- Coupons -------------------------------- */

export type CouponDiscountType = "percent" | "fixed";
/** Stored lifecycle. "Scheduled" / "Expired" / "Used up" are derived at read time. */
export type CouponStatus = "active" | "inactive" | "archived";
export type CouponDisplayStatus = "active" | "scheduled" | "expired" | "used_up" | "inactive" | "archived";

/**
 * How a coupon treats a recurring primary Offer. Maps 1:1 to Stripe coupon
 * durations: once / forever / repeating (Stripe counts repeating in MONTHS,
 * so multi-payment coupons apply only to monthly plans).
 */
export type CouponRecurringDuration =
  | { kind: "once" }
  | { kind: "forever" }
  | { kind: "repeating"; months: number };

export type CouponApplicability =
  | { kind: "all" }
  | { kind: "offers"; offerIds: string[] };

export interface Coupon {
  id: string;
  agencyId: string;
  subAccountId: string;
  /** Normalized: upper-case A–Z, 0–9 and hyphens, 3–32 chars. */
  code: string;
  name: string;
  status: CouponStatus;
  discountType: CouponDiscountType;
  /** 1–100 when percent. */
  percentOff: number | null;
  /** Cents when fixed. */
  amountOffCents: number | null;
  /** ISO 4217 upper-case; required when fixed. */
  currency: string | null;
  startsAt: number | null;
  expiresAt: number | null;
  maxRedemptions: number | null;
  maxPerCustomer: number | null;
  minimumSubtotalCents: number | null;
  appliesTo: CouponApplicability;
  includeOrderBumps: boolean;
  recurringDuration: CouponRecurringDuration;
  /** Paid orders only — never incremented on code entry. */
  redemptionCount: number;
  discountGivenCents: number;
  revenueCents: number;
  createdByUid: string;
  createdAt: number;
  updatedAt: number;
}

export interface CouponRedemption {
  id: string; // == orderId
  couponId: string;
  subAccountId: string;
  code: string;
  orderId: string;
  memberId: string;
  email: string;
  discountCents: number;
  orderTotalCents: number;
  currency: string;
  redeemedAt: number;
}

/* --------------------------------- Orders --------------------------------- */

export type OrderItemRole = "primary" | "bump";

/** A line the engine prices. Built only from server-side Offer reads. */
export interface PricedOfferLine {
  offerId: string;
  role: OrderItemRole;
  bumpId: string | null;
  title: string;
  /** "free" lines carry 0. */
  billing: "free" | "one_time" | "recurring";
  unitAmountCents: number;
  currency: string;
  interval: RecurringInterval | null;
  trialDays: number;
}

export interface PricedLine extends PricedOfferLine {
  discountCents: number;
  /** Charged today for this line after discount. */
  dueTodayCents: number;
}

export interface OrderTotals {
  currency: string;
  subtotalCents: number;
  discountCents: number;
  dueTodayCents: number;
  /** Present when the primary Offer is recurring. */
  recurring: {
    amountCents: number;
    interval: RecurringInterval;
    trialDays: number;
    /** Price of the next renewals while the coupon still applies. */
    discountedAmountCents: number;
    /** 0 = no coupon; -1 = forever; n = number of discounted payments. */
    discountedPayments: number;
  } | null;
  lines: PricedLine[];
}

export type CheckoutOrderStatus = "pending" | "paid" | "failed" | "canceled";

export interface CheckoutOrderItem {
  offerId: string;
  role: OrderItemRole;
  bumpId: string | null;
  title: string;
  billing: PricedOfferLine["billing"];
  unitAmountCents: number;
  discountCents: number;
  dueTodayCents: number;
  /** Purchase doc under subAccounts/{sa}/courseOffers/{offerId}/purchases. */
  purchaseId: string | null;
  fulfillment: "pending" | "granted" | "failed";
  fulfillmentError: string | null;
}

export interface CheckoutOrder {
  id: string;
  agencyId: string;
  subAccountId: string;
  configId: string;
  context: CheckoutContext;
  memberId: string;
  /** True when the email matched an existing Member who wasn't signed in. */
  matchedExistingMember: boolean;
  /** Phase 3: the checkout session this order belongs to (null on older orders). */
  sessionId?: string | null;
  /** Phase 3: the buyer ticked the marketing opt-in box for this order. */
  marketingOptIn?: boolean;
  /** Phase 3: CRM completion actions ran (tags, event) — at most once. */
  crmCompletedAt?: number | null;
  buyer: { name: string; email: string; phone: string };
  agreementAccepted: boolean;
  currency: string;
  items: CheckoutOrderItem[];
  coupon: { couponId: string; code: string } | null;
  totals: OrderTotals;
  paymentMode: "test" | "live" | null;
  stripeAccountId: string | null;
  stripeCustomerId: string | null;
  stripePaymentIntentId: string | null;
  stripeSetupIntentId: string | null;
  stripeSubscriptionId: string | null;
  /** Stripe coupon ids minted for this order (one-off, deleted never). */
  stripeCouponIds: string[];
  status: CheckoutOrderStatus;
  failureReason: string | null;
  paidAt: number | null;
  createdAt: number;
  updatedAt: number;
}

/* --------------------------- Checkout sessions ---------------------------- */

export type CheckoutSessionStatus = "started" | "completed" | "abandoned" | "superseded";

/**
 * One deliberate checkout start by one buyer (Phase 3). Created when the
 * buyer continues from Step 1 (two-step) or once a valid email is captured
 * (one-step) — never on page load or per keystroke. Server-only.
 * Holds no prices: a resumed checkout is always re-quoted.
 */
export interface CheckoutSession {
  id: string;
  agencyId: string;
  subAccountId: string;
  configId: string;
  context: CheckoutContext;
  offerId: string;
  format: CheckoutFormat;
  email: string;
  name: string;
  phone: string;
  contactId: string | null;
  status: CheckoutSessionStatus;
  marketingOptIn: boolean;
  /** Last add-on selection / code typed (revalidated on resume). */
  bumpIds: string[];
  couponCode: string | null;
  sourceUrl: string | null;
  orderId: string | null;
  startedAt: number;
  lastActivityAt: number;
  completedAt: number | null;
  abandonedAt: number | null;
  /** Single-field range-queried by the hourly sweep; null once settled. */
  abandonDueAt: number | null;
  abandonment: { scheduledFor: number | null; messageId: string | null; firedAt: number | null };
  /** SHA-256 of the active resume token (raw token never stored). */
  resumeTokenHash: string | null;
  supersededBy: string | null;
  createdAt: number;
  updatedAt: number;
}
