/**
 * Coupons — PURE rules (no Firestore). Input validation for the Coupons
 * screen, the derived display status, and the redemption check the
 * checkout engine runs on the server before pricing an order.
 */
import type {
  Coupon,
  CouponApplicability,
  CouponDiscountType,
  CouponDisplayStatus,
  CouponRecurringDuration,
  CouponStatus,
  PricedOfferLine,
} from "@/types/checkout";
import type { PricingCoupon } from "./pricing";

export const COUPON_CODE_RE = /^[A-Z0-9][A-Z0-9-]{2,31}$/;

/** Upper-case, trimmed, inner spaces removed. Returns null when not a valid code. */
export function normalizeCouponCode(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const code = raw.trim().toUpperCase().replace(/\s+/g, "");
  return COUPON_CODE_RE.test(code) ? code : null;
}

export interface CouponInput {
  code: string;
  name: string;
  status: CouponStatus;
  discountType: CouponDiscountType;
  percentOff: number | null;
  amountOffCents: number | null;
  currency: string | null;
  startsAt: number | null;
  expiresAt: number | null;
  maxRedemptions: number | null;
  maxPerCustomer: number | null;
  minimumSubtotalCents: number | null;
  appliesTo: CouponApplicability;
  includeOrderBumps: boolean;
  recurringDuration: CouponRecurringDuration;
}

const num = (v: unknown): number | null =>
  v === null || v === undefined || v === "" ? null : typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : NaN;

/** Validate the Coupons screen payload. Never trusts the browser's shapes. */
export function validateCouponInput(raw: unknown): { ok: true; value: CouponInput } | { ok: false; errors: Record<string, string> } {
  const b = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const errors: Record<string, string> = {};
  const code = normalizeCouponCode(b.code);
  if (!code) errors.code = "Use 3–32 letters, numbers or hyphens (for example SAVE20).";
  const name = typeof b.name === "string" ? b.name.trim().slice(0, 80) : "";
  const status: CouponStatus = b.status === "inactive" || b.status === "archived" ? b.status : "active";
  const discountType: CouponDiscountType = b.discountType === "fixed" ? "fixed" : "percent";

  let percentOff: number | null = null;
  let amountOffCents: number | null = null;
  let currency: string | null = null;
  if (discountType === "percent") {
    const p = num(b.percentOff);
    if (p === null || Number.isNaN(p) || p <= 0 || p > 100) errors.percentOff = "Enter a percentage from 1 to 100.";
    else if (Math.round(p * 100) / 100 !== p) errors.percentOff = "Use at most two decimal places.";
    else percentOff = p;
  } else {
    const a = num(b.amountOffCents);
    if (a === null || Number.isNaN(a) || a <= 0 || !Number.isInteger(a)) errors.amountOffCents = "Enter an amount greater than zero.";
    else amountOffCents = a;
    const c = typeof b.currency === "string" ? b.currency.trim().toUpperCase() : "";
    if (!/^[A-Z]{3}$/.test(c)) errors.currency = "Choose a currency for a fixed-amount coupon.";
    else currency = c;
  }

  const startsAt = num(b.startsAt);
  const expiresAt = num(b.expiresAt);
  if (Number.isNaN(startsAt)) errors.startsAt = "Enter a valid start date.";
  if (Number.isNaN(expiresAt)) errors.expiresAt = "Enter a valid expiration date.";
  if (startsAt && expiresAt && !Number.isNaN(startsAt) && !Number.isNaN(expiresAt) && expiresAt <= startsAt)
    errors.expiresAt = "The expiration date must be after the start date.";

  const posInt = (key: string, label: string): number | null => {
    const v = num(b[key]);
    if (v === null) return null;
    if (Number.isNaN(v) || !Number.isInteger(v) || v < 1) {
      errors[key] = `${label} must be a whole number of at least 1.`;
      return null;
    }
    return v;
  };
  const maxRedemptions = posInt("maxRedemptions", "The usage limit");
  const maxPerCustomer = posInt("maxPerCustomer", "The per-customer limit");
  const minimumSubtotalCents = posInt("minimumSubtotalCents", "The minimum purchase");

  let appliesTo: CouponApplicability = { kind: "all" };
  const at = b.appliesTo as { kind?: unknown; offerIds?: unknown } | undefined;
  if (at?.kind === "offers") {
    const ids = Array.isArray(at.offerIds)
      ? [...new Set(at.offerIds.filter((x): x is string => typeof x === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(x)))]
      : [];
    if (ids.length === 0) errors.appliesTo = "Choose at least one Offer, or apply the coupon to all checkouts.";
    appliesTo = { kind: "offers", offerIds: ids.slice(0, 200) };
  }

  let recurringDuration: CouponRecurringDuration = { kind: "once" };
  const rd = b.recurringDuration as { kind?: unknown; months?: unknown } | undefined;
  if (rd?.kind === "forever") recurringDuration = { kind: "forever" };
  else if (rd?.kind === "repeating") {
    const m = num(rd.months);
    if (m === null || Number.isNaN(m) || !Number.isInteger(m) || m < 2 || m > 36)
      errors.recurringDuration = "Choose between 2 and 36 monthly payments.";
    else recurringDuration = { kind: "repeating", months: m };
  }

  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    value: {
      code: code!,
      name,
      status,
      discountType,
      percentOff,
      amountOffCents,
      currency,
      startsAt: startsAt ?? null,
      expiresAt: expiresAt ?? null,
      maxRedemptions,
      maxPerCustomer,
      minimumSubtotalCents,
      appliesTo,
      includeOrderBumps: b.includeOrderBumps !== false,
      recurringDuration,
    },
  };
}

export function couponDisplayStatus(c: Pick<Coupon, "status" | "startsAt" | "expiresAt" | "maxRedemptions" | "redemptionCount">, now: number): CouponDisplayStatus {
  if (c.status === "archived") return "archived";
  if (c.status === "inactive") return "inactive";
  if (c.expiresAt && now >= c.expiresAt) return "expired";
  if (c.maxRedemptions !== null && c.redemptionCount >= c.maxRedemptions) return "used_up";
  if (c.startsAt && now < c.startsAt) return "scheduled";
  return "active";
}

export type CouponRejection =
  | "not_found"
  | "inactive"
  | "not_started"
  | "expired"
  | "used_up"
  | "customer_limit"
  | "minimum"
  | "offer"
  | "currency"
  | "interval"
  | "nothing_to_discount";

const REJECTION_TEXT: Record<CouponRejection, string> = {
  not_found: "That code isn't valid.",
  inactive: "That code isn't active.",
  not_started: "That code isn't active yet.",
  expired: "That code has expired.",
  used_up: "That code has reached its usage limit.",
  customer_limit: "You've already used that code.",
  minimum: "Your order doesn't meet this code's minimum purchase.",
  offer: "That code can't be used for this order.",
  currency: "That code can't be used with this currency.",
  interval: "That code can only be used with monthly plans.",
  nothing_to_discount: "That code doesn't apply to anything in your order.",
};

export function couponRejectionMessage(r: CouponRejection): string {
  return REJECTION_TEXT[r];
}

/**
 * Can this coupon be used on this order right now? `customerRedemptions` is
 * the number of PAID orders this buyer already redeemed it on;
 * `redemptionCount` likewise counts paid orders only.
 */
export function checkCouponForOrder(input: {
  coupon: Coupon | null;
  subAccountId: string;
  now: number;
  lines: PricedOfferLine[];
  customerRedemptions: number;
}): { ok: true; pricing: PricingCoupon } | { ok: false; reason: CouponRejection } {
  const c = input.coupon;
  if (!c || c.subAccountId !== input.subAccountId || c.status === "archived") return { ok: false, reason: "not_found" };
  if (c.status === "inactive") return { ok: false, reason: "inactive" };
  if (c.startsAt && input.now < c.startsAt) return { ok: false, reason: "not_started" };
  if (c.expiresAt && input.now >= c.expiresAt) return { ok: false, reason: "expired" };
  if (c.maxRedemptions !== null && c.redemptionCount >= c.maxRedemptions) return { ok: false, reason: "used_up" };
  if (c.maxPerCustomer !== null && input.customerRedemptions >= c.maxPerCustomer) return { ok: false, reason: "customer_limit" };
  const primary = input.lines[0];
  if (!primary) return { ok: false, reason: "offer" };
  if (c.appliesTo.kind === "offers" && !c.appliesTo.offerIds.includes(primary.offerId)) return { ok: false, reason: "offer" };
  if (c.discountType === "fixed" && c.currency !== primary.currency) return { ok: false, reason: "currency" };
  if (c.recurringDuration.kind === "repeating" && primary.billing === "recurring" && primary.interval !== "month")
    return { ok: false, reason: "interval" };
  const subtotal = input.lines.reduce((s, l) => s + l.unitAmountCents, 0);
  if (c.minimumSubtotalCents !== null && subtotal < c.minimumSubtotalCents) return { ok: false, reason: "minimum" };
  const eligibleTotal = input.lines
    .filter((l) => l.unitAmountCents > 0 && (l.role === "primary" || c.includeOrderBumps))
    .reduce((s, l) => s + l.unitAmountCents, 0);
  if (eligibleTotal === 0) return { ok: false, reason: "nothing_to_discount" };
  return {
    ok: true,
    pricing: {
      discountType: c.discountType,
      percentOff: c.percentOff,
      amountOffCents: c.amountOffCents,
      includeOrderBumps: c.includeOrderBumps,
      recurringDuration: c.recurringDuration,
    },
  };
}

/** One-line human summary for the Coupons list and the drawer. */
export function couponSummary(c: Pick<Coupon, "discountType" | "percentOff" | "amountOffCents" | "currency" | "recurringDuration">): string {
  const off =
    c.discountType === "percent"
      ? `${c.percentOff}% off`
      : `${new Intl.NumberFormat("en-US", { style: "currency", currency: c.currency ?? "USD" }).format((c.amountOffCents ?? 0) / 100)} off`;
  const d = c.recurringDuration;
  const tail = d.kind === "forever" ? "every payment" : d.kind === "repeating" ? `first ${d.months} monthly payments` : "first payment";
  return `${off} · subscriptions: ${tail}`;
}
