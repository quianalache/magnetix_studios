import type { Timestamp, FieldValue } from "firebase/firestore";

/**
 * Quotes — the v1 "Estimate" feature (GHL-equivalent click-to-accept).
 *
 * Lifecycle:
 *   draft → sent → viewed → accepted | declined | expired
 *   accepted → paid (operator marks paid manually; v1 has no payment
 *   collection — payment is handled off-system by the operator).
 *
 * "expired" is a derived status — when `validUntil` is in the past we
 * treat the quote as expired on read regardless of the stored `status`.
 * The stored status only flips to "expired" if the operator explicitly
 * actions it OR a background task sweeps (out of scope for v1; the
 * read-time check covers the visitor-facing public page either way).
 *
 * Tenancy: every quote carries `agencyId / subAccountId / createdByUid`
 * to match the per-sub-account isolation pattern used by contacts /
 * deals / forms / etc. Firestore rules read `subAccountId` to gate.
 *
 * The `publicTokenHash` field stores SHA-256 of the public-share token —
 * never the token itself. The token is only ever revealed in the
 * outbound email URL and verified by HMAC, so an admin DB dump can't
 * leak shareable links.
 */

export type QuoteStatus =
  | "draft"
  | "sent"
  | "viewed"
  | "accepted"
  | "declined"
  | "expired"
  | "paid";

/**
 * What the document is for. `quote` = an estimate the recipient
 * accepts/declines; `invoice` = a demand for payment with a payment link
 * (currently a PayPal.me URL — see `paymentLinkUrl`). A doc starts as
 * `quote` (default) or `invoice` (operator skipped the estimate). An
 * accepted quote can be converted to an invoice in place via
 * /convert-to-invoice — `kind` flips and a new invoice number is issued.
 */
export type QuoteKind = "quote" | "invoice";

/**
 * Where a line item's description/price came from — Phase 1 of the
 * Products/Offers/Quotes/Invoices audit's recommended architecture
 * (2026-09-10). Three sources, all first-class:
 *
 *   "offer"         — snapshotted from a Course Offer (`offerId` +
 *                      `offerSnapshot` set). The canonical, forward path.
 *   "custom"        — a free-typed ad-hoc line (rush fee, travel, etc.),
 *                      no catalog reference at all.
 *   "legacyProduct" — snapshotted from the Product catalog (`productId`
 *                      set). Kept fully working for old documents and
 *                      anyone still using it; no longer the primary
 *                      builder path.
 *
 * Optional so every line item created before this field existed keeps
 * working unchanged — see `resolveLineItemSourceType` in
 * `src/lib/quotes/line-items.ts` for the exact backward-compat rule
 * (undefined + productId present → read as "legacyProduct"; undefined +
 * no productId → read as "custom"). Never rewritten onto historical docs.
 */
export type QuoteLineItemSourceType = "offer" | "custom" | "legacyProduct";

/**
 * Minimal identity/display snapshot of the Course Offer a line item was
 * added from, captured at add-time — same historical-accuracy discipline
 * already used for Product-backed lines and for `CourseOfferPurchase`.
 * Deliberately NOT the offer's full entitlement bundle (courses, booking,
 * project templates) — that's out of scope until the "show what's
 * included" phase. Editing or archiving the offer later never changes an
 * already-added line item.
 */
export interface QuoteOfferSnapshot {
  offerId: string;
  /** Offer title at the moment it was added. */
  name: string;
  /** Offer description at the moment it was added, if it had one. */
  description: string | null;
  offerType: "free" | "oneTime" | "recurring";
  /** Cents, mirrors `CourseOffer.priceCents` — null for a free offer. */
  priceCents: number | null;
  currency: string | null;
}

export interface QuoteLineItem {
  /** Local UUID (client-generated). Not a separate Firestore doc — the
   *  array of items lives inline on the Quote. v1 keeps it simple; we
   *  can split into a subcollection if items ever grow unbounded. */
  id: string;
  description: string;
  /** Allow fractional (e.g. 2.5 hours). Clamped to >= 0 at write time. */
  quantity: number;
  /** In the quote's currency (whole units, not cents). Clamped to >= 0. */
  unitPrice: number;
  /** Back-reference to the source product when this line was added from
   *  the catalog. Null for ad-hoc lines. The snapshot of name/price (in
   *  `description` + `unitPrice`) is authoritative — editing or archiving
   *  the product later never changes this line item. Kept permanently for
   *  legacy documents; new lines prefer `offerId` or a plain custom line —
   *  see `QuoteLineItemSourceType`. */
  productId?: string | null;
  /** See {@link QuoteLineItemSourceType}. Undefined on every line item
   *  created before Phase 1 shipped — never backfilled. */
  sourceType?: QuoteLineItemSourceType;
  /** Back-reference to the source Course Offer when `sourceType ===
   *  "offer"`. Null/omitted for custom and legacy-Product lines. Like
   *  `productId`, purely informational after add-time — `offerSnapshot`
   *  plus `description`/`unitPrice` are what actually render. */
  offerId?: string | null;
  /** Snapshot captured at the moment the Offer was added — see
   *  {@link QuoteOfferSnapshot}. Null/omitted unless `sourceType ===
   *  "offer"`. Not read by the PDF or detail-page renderer today (both
   *  still read only `description`/`quantity`/`unitPrice`); kept for a
   *  future "show what's included" phase and for internal identification. */
  offerSnapshot?: QuoteOfferSnapshot | null;
}

/** Global discount applied to the line-item subtotal. */
export type QuoteDiscount =
  | { type: "percent"; value: number } // 0–100
  | { type: "flat"; value: number } // whole units of the quote currency
  | null;

/** A declined-quote reason. The picker on the public page surfaces a
 *  fixed set; the operator sees both the reason and the optional note
 *  the recipient typed. "Other" requires a note. */
export const DECLINE_REASONS = [
  "Too expensive",
  "Not the right fit",
  "Bad timing",
  "Going with a competitor",
  "Other",
] as const;
export type DeclineReason = (typeof DECLINE_REASONS)[number];

export interface Quote {
  id: string;

  // ── Tenancy ───────────────────────────────────────────────────────
  agencyId: string;
  subAccountId: string;
  createdByUid: string;

  // ── Identity ─────────────────────────────────────────────────────
  contactId: string;
  /** Human-readable, year-prefixed sequential. Format `Q-${year}-${nnnn}`
   *  for quotes and `INV-${year}-${nnnn}` for invoices (e.g. `Q-2026-0001`,
   *  `INV-2026-0001`). Generated by lib/quotes/number.ts in an atomic
   *  transaction so two operators issuing simultaneously can't collide.
   *  Per-sub-account sequence; quotes and invoices use SEPARATE counters
   *  so the numbering of each is independent. */
  quoteNumber: string;
  /** Quote vs invoice. Defaults to "quote" on read for docs created
   *  before this field shipped. */
  kind: QuoteKind;

  // ── State ────────────────────────────────────────────────────────
  status: QuoteStatus;

  // ── Money ────────────────────────────────────────────────────────
  /** ISO 4217. Defaults to "USD". */
  currency: string;
  lineItems: QuoteLineItem[];
  /** Applied to the line-item subtotal before tax. */
  globalDiscount: QuoteDiscount;
  /** 0–100. Null = no tax applied. Applied to (subtotal − discount). */
  globalTaxPercent: number | null;

  // ── Recipient-facing content ─────────────────────────────────────
  termsAndNotes: string;
  /** Separate from `contact.company` so the operator can address the
   *  quote to a billing entity that differs from the contact's parent
   *  company (e.g. "ACME Holdings Pty Ltd" vs day-to-day "ACME"). The
   *  recipient sees this on the public page. */
  billedToOrganization: string | null;
  /** Free-form billing/postal address snapshotted from the recipient
   *  contact at the moment the contact is picked. Operator can edit
   *  per-document without affecting the contact's saved address.
   *  Null = none stored; rendered as empty on the document. */
  billingAddress: string | null;
  /** When the quote becomes invalid for acceptance. Null = no expiry.
   *  Past date = read-time treatment as expired regardless of `status`.
   *  Quote-only — ignored for invoices (they don't expire). */
  validUntil: Timestamp | FieldValue | null;
  /** Invoice-only — days from send until payment is due. 0 = "due on
   *  receipt", null = "no specific due date stated". Surfaced as
   *  "Payment due X days after sending" on the invoice email + public
   *  view. v1 doesn't auto-flip status to "overdue"; it's a recipient-
   *  facing label only. */
  paymentDueDays: number | null;

  // ── Behaviour flags ──────────────────────────────────────────────
  /** When true, accepting the quote auto-creates a Deal at the "Won"
   *  stage with the quote total as `value`. Operator can uncheck per
   *  quote for cases where they're already tracking the deal manually. */
  autoCreateDealOnAccept: boolean;

  // ── Lifecycle timestamps ─────────────────────────────────────────
  sentAt: Timestamp | FieldValue | null;
  viewedAt: Timestamp | FieldValue | null;
  acceptedAt: Timestamp | FieldValue | null;
  declinedAt: Timestamp | FieldValue | null;
  declineReason: DeclineReason | null;
  declineNote: string | null;
  paidAt: Timestamp | FieldValue | null;
  /** Stamped when an accepted quote was converted to an invoice. Null on
   *  docs that started life as an invoice or were never converted. */
  convertedFromQuoteAt: Timestamp | FieldValue | null;

  // ── Payment link (invoices only) ─────────────────────────────────
  /** Payment URL — buyer clicks "Pay" on the public invoice view or
   *  email to land here. Currently always a PayPal.me URL (see
   *  `buildPaypalInvoiceUrl` / `/api/sub-accounts/[id]/quotes/[quoteId]/send`);
   *  the field name is provider-neutral on purpose so a future provider
   *  can populate it the same way. Regenerated fresh on every send —
   *  paypal.me links are stateless, nothing to "deactivate." Null when
   *  the invoice hasn't been sent yet OR when the doc is a quote. */
  paymentLinkUrl: string | null;
  /** Provider-specific payment-link id, when the provider has one to
   *  deactivate/rotate. Stripe-backed invoices (Phase 2, 2026-09-10)
   *  store the Checkout Session id here (`cs_…`) — reusing this
   *  existing field rather than adding a redundant one. Always null for
   *  PayPal.me-backed invoices (paypal.me URLs have no id concept). */
  paymentLinkId: string | null;
  /** When the cached payment link was created. The send route compares
   *  this to `updatedAt` — if the invoice was edited since mint, the
   *  link is deactivated and a fresh one is minted. */
  paymentLinkMintedAt: Timestamp | FieldValue | null;
  /** Which provider the CURRENT paymentLinkUrl/paymentLinkId belong to.
   *  Undefined on every invoice sent before Phase 2 (the PayPal-only
   *  era) — treat undefined as "paypal" for display purposes. Quotes
   *  never set this (no payment collection on quotes). Set at send
   *  time by `/api/sub-accounts/[id]/quotes/[quoteId]/send`, not
   *  editable directly by the client. */
  paymentProvider?: "stripe" | "paypal" | null;
  /** The connected Stripe account (Stripe Connect, `acct_…`) the
   *  CURRENT `paymentLinkId` ran on — needed to expire/reference that
   *  exact session later (Connect API calls must target the same
   *  account they were created on). Null unless `paymentProvider ===
   *  "stripe"`. See `src/lib/stripe/connect.ts`. */
  stripePaymentConnectAccountId?: string | null;
  /** Integer cents the CURRENT `paymentLinkId` (a Stripe Checkout
   *  Session) was minted to collect — captured once, at mint time, from
   *  `computeQuoteTotals()`. Independent of any later edit to the
   *  invoice's line items: if the invoice is edited after a Stripe link
   *  was minted, this value does NOT change until the invoice is
   *  re-sent (which mints a fresh session for the new total). The
   *  webhook compares its reported amount against this value so a
   *  stale, unexpired session that gets paid is still recognized and
   *  reconciled correctly rather than silently mismatched. Null unless
   *  `paymentProvider === "stripe"`. */
  paymentSessionAmountCents?: number | null;

  // ── Public-share token (hash only — never the raw token) ─────────
  /** SHA-256 hex of the HMAC-signed public token. Used so we can verify
   *  a presented token without needing the token to exist in Firestore.
   *  The raw token is only ever exposed in the outbound email URL. */
  publicTokenHash: string;

  // ── Territory ────────────────────────────────────────────────────
  /** Denormalized territory tag, inherited from the quote's contact at
   *  creation and kept in sync when the contact is re-tagged. `null` on
   *  docs created before territory scoping shipped. Ignored unless the
   *  sub-account's `territoryScopingEnabled` is true. */
  territoryId?: string | null;

  // ── Audit ────────────────────────────────────────────────────────
  createdAt: Timestamp | FieldValue | null;
  updatedAt: Timestamp | FieldValue | null;
}

/** Sensible defaults for a freshly-created quote. The CRUD helper fills
 *  in the missing fields (id, tenancy, contactId, quoteNumber, hash,
 *  timestamps) and merges in any operator-supplied overrides. */
export const DEFAULT_QUOTE: Omit<
  Quote,
  | "id"
  | "agencyId"
  | "subAccountId"
  | "createdByUid"
  | "contactId"
  | "quoteNumber"
  | "publicTokenHash"
  | "createdAt"
  | "updatedAt"
> = {
  kind: "quote",
  status: "draft",
  currency: "USD",
  lineItems: [],
  globalDiscount: null,
  globalTaxPercent: null,
  termsAndNotes: "",
  billedToOrganization: null,
  billingAddress: null,
  validUntil: null,
  paymentDueDays: null,
  autoCreateDealOnAccept: true,
  sentAt: null,
  viewedAt: null,
  acceptedAt: null,
  declinedAt: null,
  declineReason: null,
  declineNote: null,
  paidAt: null,
  convertedFromQuoteAt: null,
  paymentLinkUrl: null,
  paymentLinkId: null,
  paymentLinkMintedAt: null,
  paymentProvider: null,
  stripePaymentConnectAccountId: null,
  paymentSessionAmountCents: null,
};

/** Shape of the JSON payload the public quote page POSTs when the
 *  recipient clicks Accept / Decline. Used by the public API route. */
export interface QuoteRespondPayload {
  action: "accept" | "decline";
  /** Required when action === "decline". */
  reason?: DeclineReason;
  /** Required when reason === "Other". Optional otherwise. */
  note?: string;
}
