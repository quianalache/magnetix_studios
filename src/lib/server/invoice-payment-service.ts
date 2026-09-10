import "server-only";

import type Stripe from "stripe";
import { getAdminDb } from "@/lib/firebase/admin";
import { getStripeServer } from "@/lib/stripe/server";
import { computeQuoteTotals } from "@/lib/quotes/calc";
import { markQuotePaidServerSide } from "@/lib/quotes/lifecycle";
import type { Quote } from "@/types/quotes";
import type { SubAccountDoc } from "@/types";

/**
 * Stripe payment collection for Invoices — Phase 2 (2026-09-10) of the
 * Products/Offers/Quotes/Invoices work. Reuses the SAME Stripe Connect
 * per-sub-account model already proven by Course Offers
 * (`startCourseOfferStripeCheckoutServerSide` in
 * course-offer-purchase-service.ts) and the same `metadata.kind`-routed
 * webhook dispatch convention every other Stripe integration in this repo
 * uses (`lib/stripe/webhooks.ts`).
 *
 * STRIPE ACCOUNT MODEL (verified, not assumed):
 * An Invoice ALWAYS charges on the sub-account's OWN connected Stripe
 * account (`SubAccountDoc.stripeConnect.accountId`, direct charge via
 * `{ stripeAccount: id }`) — never the shared platform account, and never
 * with the `stripeCourseCheckoutEnabledByAgency` fallback Course Offers use.
 * That flag is a narrow, explicitly-documented TEMPORARY exception for the
 * agency owner's own sub-account only (see its doc comment in
 * types/tenancy.ts: "everyone else must connect Stripe or use PayPal") —
 * replicating it here for a general, every-sub-account Invoice feature
 * would risk routing a stranger sub-account's invoice payment into the
 * agency owner's own Stripe account. So: no Stripe Connect account, no
 * Stripe invoice option, full stop — PayPal remains available regardless.
 *
 * No separate purchases/purchase-log collection: unlike a Course Offer
 * (many buyers can purchase the same offer), an Invoice IS the purchase —
 * a 1:1 relationship. The Quote document itself is the sole, authoritative
 * payment record, extended with a small number of additive fields.
 */

export const INVOICE_PAYMENT_KIND = "invoicePayment";

/** Stripe's practical floor for a card charge (50 cents), matching the
 *  message shown when an invoice total is too small to collect via Stripe. */
const MIN_STRIPE_AMOUNT_CENTS = 50;

export class InvoicePaymentError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export interface InvoiceStripeCheckoutResult {
  url: string;
  sessionId: string;
  connectAccountId: string;
  amountCents: number;
}

/**
 * Mint a Stripe Checkout Session for the CURRENT invoice total. Called by
 * the send route, which is responsible for persisting the returned fields
 * onto the quote doc (kept out of this function so the route's existing
 * single atomic `quoteRef.update()` — shared with the PayPal path — stays
 * the only write, avoiding a double-write race between two providers).
 *
 * Best-effort expires the invoice's PREVIOUS Stripe session (if any) on
 * the account it was actually minted on — a superseded session left
 * un-expired is not a correctness problem (see
 * `handleInvoiceStripeCheckoutCompleted`'s doc comment on why a payment
 * against either session is still handled safely), just tidiness.
 */
export async function createInvoiceStripeCheckoutSession(opts: {
  subAccountId: string;
  quoteId: string;
  contactEmail: string;
  contactId: string;
  publicUrl: string;
}): Promise<InvoiceStripeCheckoutResult> {
  const db = getAdminDb();
  const [quoteSnap, subSnap] = await Promise.all([
    db.collection("quotes").doc(opts.quoteId).get(),
    db.doc(`subAccounts/${opts.subAccountId}`).get(),
  ]);
  if (!quoteSnap.exists) {
    throw new InvoicePaymentError("Invoice not found.", 404);
  }
  const quote = { id: quoteSnap.id, ...(quoteSnap.data() as Omit<Quote, "id">) };
  if (quote.subAccountId !== opts.subAccountId) {
    throw new InvoicePaymentError(
      "Invoice belongs to a different sub-account.",
      403,
    );
  }
  if (quote.kind !== "invoice") {
    throw new InvoicePaymentError(
      "Stripe payment collection only applies to invoices.",
      400,
    );
  }

  const sub = subSnap.exists ? (subSnap.data() as SubAccountDoc) : null;
  const connectAccountId = sub?.stripeConnect?.accountId ?? null;
  const chargesEnabled = sub?.stripeConnect?.chargesEnabled === true;
  if (!connectAccountId || !chargesEnabled) {
    throw new InvoicePaymentError(
      "Stripe isn't fully connected for this workspace yet — connect it under Settings → Payments before sending invoices via Stripe.",
      503,
    );
  }

  const totals = computeQuoteTotals(quote);
  const amountCents = Math.round(totals.total * 100);
  if (amountCents < MIN_STRIPE_AMOUNT_CENTS) {
    throw new InvoicePaymentError(
      `Invoice total is too small to collect via Stripe (minimum ${formatMinAmount(quote.currency)}).`,
      400,
    );
  }

  const stripe = getStripeServer();

  // Best-effort: expire the PREVIOUS session, on the account it was
  // actually minted on (not necessarily this same connectAccountId, in
  // the unlikely event the sub-account's Connect link ever changed).
  // Failure here is expected and harmless — an already-paid, already-
  // expired, or already-completed session can't be re-expired; we only
  // care about the "still open" case, and even that isn't load-bearing
  // for correctness (see handleInvoiceStripeCheckoutCompleted).
  if (
    quote.paymentProvider === "stripe" &&
    quote.paymentLinkId &&
    quote.stripePaymentConnectAccountId
  ) {
    try {
      await stripe.checkout.sessions.expire(quote.paymentLinkId, {
        stripeAccount: quote.stripePaymentConnectAccountId,
      });
    } catch {
      // Expected in the common case (already paid/expired/completed).
    }
  }

  const businessName = sub?.name || "Your business";
  const metadata = {
    kind: INVOICE_PAYMENT_KIND,
    agencyId: quote.agencyId,
    subAccountId: opts.subAccountId,
    quoteId: opts.quoteId,
    contactId: opts.contactId,
  };

  const session = await stripe.checkout.sessions.create(
    {
      mode: "payment",
      customer_email: opts.contactEmail,
      line_items: [
        {
          price_data: {
            currency: quote.currency.toLowerCase(),
            unit_amount: amountCents,
            product_data: {
              name: `Invoice ${quote.quoteNumber}`,
              description: `${businessName} — ${quote.lineItems.length} line item${quote.lineItems.length === 1 ? "" : "s"}`.slice(
                0,
                500,
              ),
            },
          },
          quantity: 1,
        },
      ],
      success_url: opts.publicUrl,
      cancel_url: opts.publicUrl,
      metadata,
      payment_intent_data: { metadata },
    },
    { stripeAccount: connectAccountId },
  );
  if (!session.url) {
    throw new InvoicePaymentError("Stripe did not return a checkout URL.", 502);
  }

  return {
    url: session.url,
    sessionId: session.id,
    connectAccountId,
    amountCents,
  };
}

function formatMinAmount(currency: string): string {
  return `${(MIN_STRIPE_AMOUNT_CENTS / 100).toFixed(2)} ${currency}`;
}

/**
 * Webhook handler for `checkout.session.completed` AND
 * `checkout.session.async_payment_succeeded` (delayed payment methods —
 * e.g. bank debits — confirm here, not at `.completed`) when
 * `metadata.kind === INVOICE_PAYMENT_KIND`. Routed from
 * `src/app/api/webhooks/stripe/route.ts`.
 *
 * Validates, in order:
 *   1. Required metadata present.
 *   2. The quote exists, and its OWN stored subAccountId/agencyId/kind
 *      match the metadata exactly — defense in depth even though this
 *      metadata was stamped server-side by us, never client-influenced.
 *   3. `session.payment_status === "paid"` — a `.completed` event for a
 *      delayed payment method can fire with `payment_status: "unpaid"`;
 *      we do nothing and wait for the later `async_payment_succeeded`
 *      event instead of ever treating an unpaid session as paid.
 *   4. Currency matches the invoice's own currency — hard gate; this
 *      should be structurally impossible (WE set the session's currency)
 *      so a mismatch indicates a real anomaly, not a benign race.
 *
 * Amount is compared against `paymentSessionAmountCents` — the amount
 * captured at THIS invoice's most recent mint — for observability, but a
 * mismatch does NOT block marking the invoice paid. Rationale: if an
 * older, superseded Checkout Session (re-send mints a new one and
 * best-effort expires the old one, but expiry isn't guaranteed — see
 * `createInvoiceStripeCheckoutSession`) still gets paid, real money WAS
 * received by the sub-account's own connected account; refusing to
 * reflect that would leave a genuinely-paid invoice stuck showing
 * unpaid, which is a worse failure mode than a logged amount
 * discrepancy the operator can reconcile. This is the concrete
 * implementation of "a successful payment from either valid session
 * cannot double-mark or double-trigger lifecycle behavior" — both
 * sessions lead here, and `markQuotePaidServerSide`'s own idempotency
 * (status === "paid" → no-op) guarantees it only ever actually happens
 * once regardless of which session, or how many duplicate webhook
 * deliveries, triggered it.
 */
export async function handleInvoiceStripeCheckoutCompleted(
  session: Stripe.Checkout.Session,
): Promise<void> {
  const meta = session.metadata ?? {};
  const { agencyId, subAccountId, quoteId } = meta;
  if (!agencyId || !subAccountId || !quoteId) {
    console.error(
      `[invoice-payment] checkout session ${session.id} missing required metadata`,
    );
    return;
  }

  const quoteSnap = await getAdminDb().collection("quotes").doc(quoteId).get();
  if (!quoteSnap.exists) {
    console.error(`[invoice-payment] no quote found for id ${quoteId}`);
    return;
  }
  const quote = { id: quoteSnap.id, ...(quoteSnap.data() as Omit<Quote, "id">) };

  if (
    quote.subAccountId !== subAccountId ||
    quote.agencyId !== agencyId ||
    quote.kind !== "invoice"
  ) {
    console.error(
      `[invoice-payment] metadata/tenant mismatch for session ${session.id} — refusing to act (quote subAccountId=${quote.subAccountId} agencyId=${quote.agencyId} kind=${quote.kind}; metadata subAccountId=${subAccountId} agencyId=${agencyId})`,
    );
    return;
  }

  if (session.payment_status !== "paid") {
    // Delayed payment method, not yet confirmed — wait for
    // async_payment_succeeded. Not an error.
    console.log(
      `[invoice-payment] session ${session.id} completed with payment_status=${session.payment_status} — awaiting confirmation`,
    );
    return;
  }

  const sessionCurrency = (session.currency ?? "").toUpperCase();
  if (sessionCurrency !== quote.currency.toUpperCase()) {
    console.error(
      `[invoice-payment] currency mismatch for session ${session.id} on quote ${quoteId} — session=${sessionCurrency} quote=${quote.currency}. Refusing to mark paid.`,
    );
    return;
  }

  if (
    typeof quote.paymentSessionAmountCents === "number" &&
    session.amount_total !== quote.paymentSessionAmountCents
  ) {
    console.warn(
      `[invoice-payment] amount mismatch for session ${session.id} on quote ${quoteId} — session.amount_total=${session.amount_total} expected=${quote.paymentSessionAmountCents}. Likely an older, superseded session paid after the invoice was re-sent for a different amount. Marking paid regardless (real payment was received) — flag for manual reconciliation.`,
    );
  }

  const result = await markQuotePaidServerSide(quoteId);
  if (!result.ok) {
    console.warn(
      `[invoice-payment] markQuotePaidServerSide declined for quote ${quoteId} (session ${session.id}): ${result.error}`,
    );
    return;
  }
  if (result.alreadyPaid) {
    console.log(
      `[invoice-payment] quote ${quoteId} already paid — duplicate webhook/session for ${session.id} safely no-op'd`,
    );
  }
}
