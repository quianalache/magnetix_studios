/**
 * Checkout pricing — PURE (no Firestore, no network). The only place order
 * totals and coupon discounts are computed. The server prices every order
 * with this; the browser shows the numbers the server returns and never
 * sends a price or a discount the server trusts.
 */
import type {
  CouponDiscountType,
  CouponRecurringDuration,
  OrderTotals,
  PricedLine,
  PricedOfferLine,
} from "@/types/checkout";
import type { CourseOffer } from "@/types/course-offers";

/** The coupon facts pricing needs (already validated as usable). */
export interface PricingCoupon {
  discountType: CouponDiscountType;
  percentOff: number | null;
  amountOffCents: number | null;
  includeOrderBumps: boolean;
  recurringDuration: CouponRecurringDuration;
}

/** Turn an Offer into a priced line. Prices come only from the Offer doc. */
export function lineFromOffer(
  offer: Pick<CourseOffer, "id" | "title" | "type" | "priceCents" | "currency" | "recurringInterval" | "trialDays">,
  role: PricedOfferLine["role"],
  bumpId: string | null = null,
): PricedOfferLine {
  const billing: PricedOfferLine["billing"] =
    offer.type === "free" || !offer.priceCents ? "free" : offer.type === "recurring" ? "recurring" : "one_time";
  return {
    offerId: offer.id,
    role,
    bumpId,
    title: offer.title,
    billing,
    unitAmountCents: billing === "free" ? 0 : Math.max(0, Math.round(offer.priceCents ?? 0)),
    currency: (offer.currency ?? "USD").toUpperCase(),
    interval: billing === "recurring" ? (offer.recurringInterval ?? "month") : null,
    trialDays: billing === "recurring" ? Math.max(0, Math.round(offer.trialDays ?? 0)) : 0,
  };
}

/** Lines a coupon discounts: the primary, plus bumps when the coupon includes them. Free lines never. */
export function couponEligibleLineIndexes(lines: PricedOfferLine[], coupon: PricingCoupon): number[] {
  return lines
    .map((line, i) => ({ line, i }))
    .filter(({ line }) => line.unitAmountCents > 0 && (line.role === "primary" || coupon.includeOrderBumps))
    .map(({ i }) => i);
}

/**
 * Discount per line. Percent: each eligible line, rounded half-up. Fixed:
 * the amount spread across eligible lines in proportion to price (largest
 * remainder), never more than a line's own price — so totals can't go
 * negative and the parts always add up to the whole.
 */
export function allocateDiscounts(lines: PricedOfferLine[], coupon: PricingCoupon | null): number[] {
  const out = lines.map(() => 0);
  if (!coupon) return out;
  const eligible = couponEligibleLineIndexes(lines, coupon);
  if (eligible.length === 0) return out;
  if (coupon.discountType === "percent") {
    const pct = Math.min(100, Math.max(0, coupon.percentOff ?? 0));
    for (const i of eligible) out[i] = Math.min(lines[i].unitAmountCents, Math.round((lines[i].unitAmountCents * pct) / 100));
    return out;
  }
  const pool = eligible.reduce((s, i) => s + lines[i].unitAmountCents, 0);
  const amount = Math.min(pool, Math.max(0, Math.round(coupon.amountOffCents ?? 0)));
  if (amount === 0 || pool === 0) return out;
  const shares = eligible.map((i) => {
    const exact = (amount * lines[i].unitAmountCents) / pool;
    return { i, floor: Math.floor(exact), rem: exact - Math.floor(exact) };
  });
  let left = amount - shares.reduce((s, x) => s + x.floor, 0);
  shares.sort((a, b) => b.rem - a.rem || a.i - b.i);
  for (const s of shares) {
    out[s.i] = s.floor + (left > 0 ? 1 : 0);
    if (left > 0) left -= 1;
  }
  return out;
}

export function discountedPaymentsFor(duration: CouponRecurringDuration): number {
  if (duration.kind === "forever") return -1;
  if (duration.kind === "repeating") return Math.max(1, Math.round(duration.months));
  return 1;
}

/**
 * Price an order. The primary Offer is `lines[0]`. A recurring primary with
 * a trial is not charged today; one-time lines (bumps) always are.
 */
export function computeOrderTotals(lines: PricedOfferLine[], coupon: PricingCoupon | null = null): OrderTotals {
  if (lines.length === 0 || lines[0].role !== "primary") throw new Error("The first line must be the primary Offer.");
  const currency = lines[0].currency;
  if (lines.some((l) => l.currency !== currency)) throw new Error("Every item in an order must use the same currency.");
  const discounts = allocateDiscounts(lines, coupon);
  const priced: PricedLine[] = lines.map((line, i) => {
    const net = line.unitAmountCents - discounts[i];
    const chargedToday = line.billing === "one_time" || (line.billing === "recurring" && line.trialDays === 0);
    return { ...line, discountCents: discounts[i], dueTodayCents: chargedToday ? net : 0 };
  });
  const primary = priced[0];
  const recurring =
    primary.billing === "recurring" && primary.interval
      ? {
          amountCents: primary.unitAmountCents,
          interval: primary.interval,
          trialDays: primary.trialDays,
          discountedAmountCents: primary.unitAmountCents - primary.discountCents,
          discountedPayments: primary.discountCents > 0 && coupon ? discountedPaymentsFor(coupon.recurringDuration) : 0,
        }
      : null;
  return {
    currency,
    subtotalCents: priced.reduce((s, l) => s + l.unitAmountCents, 0),
    discountCents: priced.reduce((s, l) => s + l.discountCents, 0),
    dueTodayCents: priced.reduce((s, l) => s + l.dueTodayCents, 0),
    recurring,
    lines: priced,
  };
}

const ZERO_DECIMAL = new Set(["BIF", "CLP", "DJF", "GNF", "JPY", "KMF", "KRW", "MGA", "PYG", "RWF", "UGX", "VND", "VUV", "XAF", "XOF", "XPF"]);

export function formatMoney(cents: number, currency: string): string {
  const cur = (currency || "USD").toUpperCase();
  const value = ZERO_DECIMAL.has(cur) ? cents : cents / 100;
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: cur }).format(value);
  } catch {
    return `${value.toFixed(2)} ${cur}`;
  }
}

const INTERVAL_WORD: Record<string, string> = { day: "day", week: "week", month: "month", year: "year" };

/** "then $97.00/month after your 7-day trial" style terms for the buyer. */
export function recurringTermsText(totals: OrderTotals): string | null {
  const r = totals.recurring;
  if (!r) return null;
  const word = INTERVAL_WORD[r.interval] ?? r.interval;
  const full = `${formatMoney(r.amountCents, totals.currency)}/${word}`;
  const lead = r.trialDays > 0 ? `${r.trialDays}-day free trial, then ` : "";
  if (r.discountedPayments === 0) return `${lead}${full}`;
  const disc = `${formatMoney(r.discountedAmountCents, totals.currency)}/${word}`;
  if (r.discountedPayments === -1) return `${lead}${disc} with your discount`;
  if (r.discountedPayments === 1) return `${lead}${disc} for your first payment, then ${full}`;
  return `${lead}${disc} for your first ${r.discountedPayments} payments, then ${full}`;
}
