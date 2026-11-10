import "server-only";

import type Stripe from "stripe";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { getCourseOffer } from "@/lib/server/course-offer-service";
import {
  enrollAllCoursesForFreeOfferServerSide,
  grantCourseOfferAccessServerSide,
} from "@/lib/server/course-offer-purchase-service";
import { ensureMember, ExistingMemberRequiresSignInError, findMemberByEmail } from "@/lib/community/member-account";
import { signMemberSessionToken } from "@/lib/community/member-auth";
import { getCurrentMember, setMemberSessionCookie } from "@/lib/community/member-session";
import { getStripeEnvironment, getStripeServer, normalizePaymentMode, resolveStripeForSubAccount } from "@/lib/stripe/server";
import { normalizeAttribution } from "@/lib/attribution";
import { checkCouponForOrder, couponRejectionMessage, describeCouponEffect, type CouponEffect } from "@/lib/checkout/coupons";
import { liveBumps } from "@/lib/checkout/config";
import { computeOrderTotals, lineFromOffer, type PricingCoupon } from "@/lib/checkout/pricing";
import type {
  CheckoutBump,
  CheckoutConfig,
  CheckoutOrder,
  CheckoutOrderItem,
  CouponRecurringDuration,
  OrderTotals,
  PricedOfferLine,
} from "@/types/checkout";
import type { CourseOffer, CourseOfferPurchase } from "@/types/course-offers";
import type { Member } from "@/types/community";
import { CheckoutError, assertId } from "./common";
import { getCheckoutConfigDoc, getHostedCheckoutConfig } from "./config-service";
import { customerRedemptionCount, findCouponByCode, recordCouponRedemption } from "./coupons-service";
import { completeCheckoutCrm, linkOrderToSession, upsertCheckoutSession, type SessionResult } from "./crm-service";

/**
 * The shared checkout engine (Checkout Foundation Phase 1). Serves the
 * Funnel Checkout Step and the hosted Offer checkout through the SAME code:
 *
 *   resolveCheckout()  config + live Offers → what the buyer sees
 *   quoteCheckout()    bumps + coupon → server-computed totals
 *   startCheckout()    identity + order + per-Offer purchases + Stripe intent
 *   completeOrder()    verify with Stripe → grant each Offer once → route
 *
 * Payment uses Stripe's Payment Element with a deferred intent. One-time
 * orders are a single PaymentIntent. A recurring primary is a Stripe
 * Subscription whose first invoice carries the one-time bumps
 * (`add_invoice_items`), so a trial plan + a one-time bump charges the bump
 * today and the plan after the trial. Coupons become one-off Stripe
 * `amount_off` coupons attached per item, using the exact amounts Magnetix
 * computed, so Stripe always charges what the buyer was shown.
 */

export const CHECKOUT_ORDER_KIND = "checkoutOrder";

const ordersCol = () => getAdminDb().collection("checkoutOrders");
const purchasesCol = (sa: string, offerId: string) => getAdminDb().collection(`subAccounts/${sa}/courseOffers/${offerId}/purchases`);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/* ------------------------------ Resolution ------------------------------- */

export interface ResolvedCheckout {
  config: CheckoutConfig;
  primary: CourseOffer;
  bumps: Array<{ bump: CheckoutBump; offer: CourseOffer }>;
  funnelStatus: string | null;
}

async function loadConfig(configId: string): Promise<CheckoutConfig> {
  assertId(configId, "checkout");
  const raw = await getCheckoutConfigDoc(configId);
  if (!raw) throw new CheckoutError("This checkout isn't available.", 404);
  if (raw.context.type === "hosted_offer") {
    return (await getHostedCheckoutConfig(raw.subAccountId, raw.context.offerId)).config;
  }
  return raw;
}

/**
 * Everything the buyer can see, from server reads only. `preview` lets the
 * admin preview render drafts and unpublished funnels; it is never used to
 * take a payment.
 */
export async function resolveCheckout(configId: string, opts: { preview?: boolean } = {}): Promise<ResolvedCheckout> {
  const config = await loadConfig(configId);
  let funnelStatus: string | null = null;
  if (config.context.type === "funnel_step") {
    const funnel = await getAdminDb().doc(`funnels/${config.context.funnelId}`).get();
    funnelStatus = (funnel.data()?.status as string) ?? null;
    if (!funnel.exists || funnel.data()?.subAccountId !== config.subAccountId || funnelStatus === "archived")
      throw new CheckoutError("This checkout isn't available.", 404);
    if (!opts.preview && funnelStatus !== "published") throw new CheckoutError("This checkout isn't published yet.", 404);
  } else if (!opts.preview && !config.enabled) {
    throw new CheckoutError("This checkout isn't available.", 404);
  }
  if (!config.primaryOfferId) throw new CheckoutError("Choose a primary Offer for this checkout first.", 404);
  const primary = await getCourseOffer(config.subAccountId, config.primaryOfferId);
  if (!primary || primary.subAccountId !== config.subAccountId || primary.systemManaged || primary.visibility === "archived")
    throw new CheckoutError("This offer is no longer available.", 404, null, "unavailable");
  if (!opts.preview && primary.visibility !== "published") throw new CheckoutError("This offer is no longer available.", 404, null, "unavailable");
  const bumpOffers = await Promise.all(config.bumps.map((b) => getCourseOffer(config.subAccountId, b.offerId)));
  const byId = new Map(bumpOffers.filter((o): o is CourseOffer => !!o).map((o) => [o.id, o]));
  const visible = liveBumps(config.bumps, byId, primary, config.subAccountId);
  return { config, primary, bumps: visible.map((bump) => ({ bump, offer: byId.get(bump.offerId)! })), funnelStatus };
}

function linesFor(resolved: ResolvedCheckout, bumpIds: string[]): PricedOfferLine[] {
  const wanted = new Set(bumpIds);
  const lines = [lineFromOffer(resolved.primary, "primary")];
  for (const { bump, offer } of resolved.bumps) if (wanted.has(bump.id)) lines.push(lineFromOffer(offer, "bump", bump.id));
  return lines;
}

function selectedBumpIds(raw: unknown, resolved: ResolvedCheckout, opts: { strict?: boolean } = {}): string[] {
  const allowed = new Set(resolved.bumps.map((b) => b.bump.id));
  const ids = [...new Set(Array.isArray(raw) ? raw.filter((x): x is string => typeof x === "string") : [])];
  const live = ids.filter((id) => allowed.has(id));
  // At payment time an add-on that disappeared (archived, unpublished, price
  // currency changed…) must stop the payment rather than silently charging a
  // different order than the one the buyer saw.
  if (opts.strict && live.length !== ids.length) {
    throw new CheckoutError("One of the add-ons you chose is no longer available. We've updated your order — please review it and try again.", 409, null, "stale_bump");
  }
  return live;
}

/* -------------------------------- Pricing -------------------------------- */

export interface QuoteResult {
  totals: OrderTotals;
  coupon: ({ code: string; applied: true } & CouponEffect) | { code: string; applied: false; message: string } | null;
  /** Add-on ids the buyer had selected that are no longer available. */
  removedBumpIds: string[];
}

async function priceWithCoupon(
  resolved: ResolvedCheckout,
  lines: PricedOfferLine[],
  rawCode: unknown,
  memberId: string | null,
): Promise<{ totals: OrderTotals; couponId: string | null; code: string | null; rejection: string | null; pricing: PricingCoupon | null }> {
  const typed = typeof rawCode === "string" ? rawCode.trim() : "";
  if (!typed || !resolved.config.couponsEnabled) {
    return { totals: computeOrderTotals(lines), couponId: null, code: null, rejection: typed ? "Discount codes aren't accepted on this checkout." : null, pricing: null };
  }
  const coupon = await findCouponByCode(resolved.config.subAccountId, typed);
  const customerRedemptions = coupon && memberId && coupon.maxPerCustomer !== null ? await customerRedemptionCount(coupon.id, memberId) : 0;
  const check = checkCouponForOrder({ coupon, subAccountId: resolved.config.subAccountId, now: Date.now(), lines, customerRedemptions });
  if (!check.ok) return { totals: computeOrderTotals(lines), couponId: null, code: typed.toUpperCase(), rejection: couponRejectionMessage(check.reason), pricing: null };
  return { totals: computeOrderTotals(lines, check.pricing), couponId: coupon!.id, code: coupon!.code, rejection: null, pricing: check.pricing };
}

export async function quoteCheckout(configId: string, body: Record<string, unknown>, opts: { preview?: boolean } = {}): Promise<QuoteResult> {
  const resolved = await resolveCheckout(configId, opts);
  const requested = Array.isArray(body.bumpIds) ? body.bumpIds.filter((x): x is string => typeof x === "string") : [];
  const bumpIds = selectedBumpIds(requested, resolved);
  const lines = linesFor(resolved, bumpIds);
  // Per-customer limits are enforced at payment time, once the buyer is known.
  const priced = await priceWithCoupon(resolved, lines, body.couponCode, null);
  return {
    totals: priced.totals,
    coupon: priced.code
      ? priced.rejection || !priced.pricing
        ? { code: priced.code, applied: false, message: priced.rejection ?? "That code isn't valid." }
        : { code: priced.code, applied: true, ...describeCouponEffect(priced.pricing, priced.totals) }
      : null,
    removedBumpIds: requested.filter((id) => !bumpIds.includes(id)),
  };
}

/* -------------------------------- Identity ------------------------------- */

/**
 * Who is buying. A known email never forces a sign-in before payment:
 *  - signed in as that member → that member;
 *  - email matches an existing member → that member, with NO profile
 *    changes and NO session (typing someone's email can't sign you in as
 *    them or edit their details; the purchase is simply theirs);
 *  - new email → a new member, signed in on this device as today.
 */
export async function resolveCheckoutMember(input: {
  subAccountId: string;
  email: string;
  name: string;
  phone: string | null;
  attribution: ReturnType<typeof normalizeAttribution>;
}): Promise<{ member: Member; matchedExisting: boolean }> {
  const current = await getCurrentMember(input.subAccountId);
  if (current && current.email.toLowerCase() === input.email) return { member: current, matchedExisting: false };
  const existing = await findMemberByEmail(input.subAccountId, input.email);
  if (existing) {
    if (existing.status && existing.status !== "active") throw new CheckoutError("We couldn't start checkout for this email. Contact the seller for help.", 403);
    return { member: existing, matchedExisting: true };
  }
  try {
    const member = await ensureMember({
      subAccountId: input.subAccountId,
      email: input.email,
      displayName: input.name,
      phone: input.phone,
      source: "course",
      attribution: input.attribution,
      emailProof: "unverified-signup",
    });
    await setMemberSessionCookie(signMemberSessionToken(input.subAccountId, member.id, member.email));
    return { member, matchedExisting: false };
  } catch (err) {
    // Lost a race with another sign-up for the same email: treat as known.
    if (err instanceof ExistingMemberRequiresSignInError) {
      const raced = await findMemberByEmail(input.subAccountId, input.email);
      if (raced) return { member: raced, matchedExisting: true };
    }
    throw err;
  }
}

/* ------------------------------ Stripe setup ----------------------------- */

interface StripeTarget {
  stripe: Stripe;
  accountId: string | null;
  paymentMode: "test" | "live";
  requestOptions: Stripe.RequestOptions | undefined;
}

async function resolveStripeTarget(subAccountId: string, primary: CourseOffer): Promise<StripeTarget> {
  const sub = (await getAdminDb().doc(`subAccounts/${subAccountId}`).get()).data();
  const paymentMode = normalizePaymentMode(primary.paymentMode, getStripeEnvironment());
  const resolved = await resolveStripeForSubAccount(subAccountId, paymentMode).catch((error) => {
    if (sub?.stripeCourseCheckoutEnabledByAgency === true && !primary.paymentMode) return null;
    throw error;
  });
  const accountId = resolved?.accountId ?? null;
  if (!accountId && sub?.stripeCourseCheckoutEnabledByAgency !== true) {
    throw new CheckoutError("Card payments aren't set up for this business yet. Contact the seller to arrange another way to pay.", 409, null, "payments_not_ready");
  }
  return {
    stripe: resolved?.stripe ?? getStripeServer(paymentMode),
    accountId,
    paymentMode,
    requestOptions: accountId ? { stripeAccount: accountId } : undefined,
  };
}

/** The browser key for a payment mode (an explicit per-mode key wins). */
export function publishableKeyFor(mode: "test" | "live"): string | null {
  const candidates = [
    mode === "test" ? process.env.STRIPE_PUBLISHABLE_KEY_TEST : process.env.STRIPE_PUBLISHABLE_KEY_LIVE,
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
  ];
  for (const key of candidates) {
    const k = key?.trim();
    if (k && k.startsWith(mode === "test" ? "pk_test_" : "pk_live_")) return k;
  }
  return null;
}

/** Is card payment possible for this checkout? Never throws. */
export async function paymentReadiness(resolved: ResolvedCheckout): Promise<{ ready: boolean; mode: "test" | "live" | null; message: string | null; publishableKey: string | null; stripeAccount: string | null }> {
  try {
    const t = await resolveStripeTarget(resolved.config.subAccountId, resolved.primary);
    const publishableKey = publishableKeyFor(t.paymentMode);
    if (!publishableKey) return { ready: false, mode: t.paymentMode, message: "Card payments aren't configured on this site yet.", publishableKey: null, stripeAccount: null };
    return { ready: true, mode: t.paymentMode, message: null, publishableKey, stripeAccount: t.accountId };
  } catch (err) {
    return { ready: false, mode: null, message: err instanceof Error ? err.message : "Card payments aren't available.", publishableKey: null, stripeAccount: null };
  }
}

/** One Stripe Product per Offer per Stripe account+mode, reused across orders. */
async function stripeProductFor(target: StripeTarget, offer: CourseOffer): Promise<string> {
  const key = `${target.accountId ?? "platform"}__${target.paymentMode}__${offer.id}`;
  const ref = getAdminDb().collection("stripeOfferProducts").doc(key);
  const cached = (await ref.get()).data()?.productId as string | undefined;
  if (cached) return cached;
  const product = await target.stripe.products.create(
    { name: offer.title.slice(0, 250) || "Offer", metadata: { magnetixOfferId: offer.id, subAccountId: offer.subAccountId } },
    target.requestOptions,
  );
  await ref.set({ productId: product.id, offerId: offer.id, subAccountId: offer.subAccountId, createdAt: Date.now() });
  return product.id;
}

async function stripeCustomerFor(target: StripeTarget, member: Member, buyer: { name: string; phone: string }): Promise<string> {
  const existing = await target.stripe.customers.list({ email: member.email, limit: 1 }, target.requestOptions);
  if (existing.data[0]) return existing.data[0].id;
  const created = await target.stripe.customers.create(
    { email: member.email, name: buyer.name || member.displayName || undefined, ...(buyer.phone ? { phone: buyer.phone } : {}) },
    target.requestOptions,
  );
  return created.id;
}

/**
 * Map a coupon's recurring duration to Stripe. Stripe starts counting a
 * repeating coupon when the subscription starts, so a trial's months are
 * added on top to cover the same number of PAID payments.
 */
export function stripeDurationFor(d: CouponRecurringDuration, trialDays: number): Pick<Stripe.CouponCreateParams, "duration" | "duration_in_months"> {
  if (d.kind === "forever") return { duration: "forever" };
  if (d.kind === "repeating") return { duration: "repeating", duration_in_months: d.months + Math.floor(trialDays / 31) };
  return { duration: "once" };
}

async function oneOffCoupon(target: StripeTarget, amount: number, currency: string, duration: Pick<Stripe.CouponCreateParams, "duration" | "duration_in_months">, orderId: string): Promise<string> {
  const c = await target.stripe.coupons.create(
    { amount_off: amount, currency: currency.toLowerCase(), ...duration, max_redemptions: 1, name: "Discount", metadata: { magnetixOrderId: orderId } },
    target.requestOptions,
  );
  return c.id;
}

/* -------------------------------- Starting ------------------------------- */

export interface StartResult {
  orderId: string;
  /** "redirect": nothing to pay — go straight to `redirectTo`. */
  next: "pay" | "redirect";
  redirectTo?: string;
  clientSecret?: string;
  intentType?: "payment" | "setup";
  publishableKey?: string;
  stripeAccount?: string | null;
  totals: OrderTotals;
}

function purchaseDoc(input: {
  order: Pick<CheckoutOrder, "id" | "subAccountId" | "agencyId" | "memberId" | "currency" | "paymentMode" | "stripeAccountId" | "stripeCustomerId">;
  offer: CourseOffer;
  item: CheckoutOrderItem;
  attribution: CourseOfferPurchase["attribution"];
}): Omit<CourseOfferPurchase, "id"> {
  const { order, offer, item } = input;
  return {
    subAccountId: order.subAccountId,
    agencyId: order.agencyId,
    offerId: offer.id,
    courseIds: offer.courseIds,
    booking: offer.booking,
    projectTemplates: offer.projectTemplates,
    communityAccess: offer.communityAccess ?? [],
    memberId: order.memberId,
    amountCents: item.unitAmountCents - item.discountCents,
    currency: order.currency,
    method: item.unitAmountCents - item.discountCents > 0 ? "stripe" : "free",
    paypalUrl: null,
    stripeCheckoutSessionId: null,
    stripeCustomerId: order.stripeCustomerId,
    stripeSubscriptionId: null,
    stripePaymentIntentId: null,
    stripeConnectAccountId: order.stripeAccountId,
    ...(order.paymentMode ? { paymentMode: order.paymentMode } : {}),
    status: "pending",
    grantedByUid: null,
    requestedAt: FieldValue.serverTimestamp(),
    paidAt: null,
    billingCity: null,
    billingState: null,
    billingCountry: null,
    attribution: item.role === "primary" ? input.attribution : null,
    purchaseSource: "checkout",
    orderId: order.id,
    orderRole: item.role,
  };
}

function cleanBuyer(body: Record<string, unknown>, config: CheckoutConfig) {
  const errors: Record<string, string> = {};
  const s = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");
  const email = s(body.email, 254).toLowerCase();
  let name = s(body.name, 120);
  if (config.nameFormat === "first_last") {
    const first = s(body.firstName, 60);
    const last = s(body.lastName, 60);
    if (!first) errors.firstName = "Enter your first name.";
    if (!last) errors.lastName = "Enter your last name.";
    name = `${first} ${last}`.trim();
  } else if (!name) errors.name = "Enter your name.";
  if (!EMAIL_RE.test(email)) errors.email = "Enter a valid email address.";
  const phone = config.phone === "hidden" ? "" : s(body.phone, 40);
  if (config.phone === "required" && !phone) errors.phone = "Enter your phone number.";
  if (phone && !/^[+()\d\s.-]{6,40}$/.test(phone)) errors.phone = "Enter a valid phone number.";
  const agreementAccepted = body.agreementAccepted === true;
  if (config.agreement.mode !== "notRequired" && !agreementAccepted) errors.agreement = "Please agree to the terms to continue.";
  return { errors, buyer: { name, email, phone }, agreementAccepted };
}

/** What the browser may tell us about an in-progress checkout (never prices). */
function sessionHints(body: Record<string, unknown>, resolved: ResolvedCheckout) {
  const attribution = normalizeAttribution(body.attribution as never);
  const allowed = new Set(resolved.bumps.map((b) => b.bump.id));
  const bumpIds = Array.isArray(body.bumpIds) ? body.bumpIds.filter((x): x is string => typeof x === "string" && allowed.has(x)) : [];
  const couponCode = typeof body.couponCode === "string" && body.couponCode.trim() ? body.couponCode.trim().slice(0, 40) : null;
  return {
    attribution,
    bumpIds,
    couponCode,
    marketingOptIn: body.marketingOptIn === true && resolved.config.crm.marketingOptIn.enabled,
    sourceUrl: attribution?.landingPage ?? null,
  };
}

/** Best-effort CRM start — a CRM hiccup never blocks the buyer. */
async function startSession(resolved: ResolvedCheckout, buyer: { name: string; email: string; phone: string }, body: Record<string, unknown>): Promise<SessionResult> {
  const hints = sessionHints(body, resolved);
  try {
    return await upsertCheckoutSession({
      config: resolved.config,
      offerId: resolved.primary.id,
      email: buyer.email,
      name: buyer.name,
      phone: buyer.phone,
      sessionId: body.sessionId,
      marketingOptIn: hints.marketingOptIn,
      bumpIds: hints.bumpIds,
      couponCode: hints.couponCode,
      sourceUrl: hints.sourceUrl,
      attribution: hints.attribution,
    });
  } catch (err) {
    console.error("[checkout] session start failed", err);
    return { sessionId: null, contactId: null };
  }
}

/**
 * Step 1 of a two-step checkout: validate buyer details, then — the
 * deliberate checkout start — create/reuse the checkout session + Contact
 * (when the checkout's CRM settings capture contacts).
 */
export async function startBuyerStep(configId: string, body: Record<string, unknown>): Promise<{ sessionId: string | null }> {
  const resolved = await resolveCheckout(configId);
  const { errors, buyer } = cleanBuyer({ ...body, agreementAccepted: true }, resolved.config);
  if (Object.keys(errors).length) throw new CheckoutError("Check your details.", 400, errors);
  const { sessionId } = await startSession(resolved, buyer, body);
  return { sessionId };
}

/**
 * One-step checkout start: called once the buyer has entered a VALID email
 * (on leaving the field, debounced) — not per keystroke. Only the email is
 * required here; name and phone are recorded when present.
 */
export async function startOneStepSession(configId: string, body: Record<string, unknown>): Promise<{ sessionId: string | null }> {
  const resolved = await resolveCheckout(configId);
  const s = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");
  const email = s(body.email, 254).toLowerCase();
  if (!EMAIL_RE.test(email)) throw new CheckoutError("Enter a valid email address.", 400, { email: "Enter a valid email address." });
  const name = resolved.config.nameFormat === "first_last" ? `${s(body.firstName, 60)} ${s(body.lastName, 60)}`.trim() : s(body.name, 120);
  const phone = resolved.config.phone === "hidden" ? "" : s(body.phone, 40);
  const { sessionId } = await startSession(resolved, { name, email, phone: /^[+()\d\s.-]{6,40}$/.test(phone) ? phone : "" }, body);
  return { sessionId };
}

export async function startCheckout(configId: string, body: Record<string, unknown>): Promise<StartResult> {
  const resolved = await resolveCheckout(configId);
  const { config, primary } = resolved;
  const { errors, buyer, agreementAccepted } = cleanBuyer(body, config);
  if (Object.keys(errors).length) throw new CheckoutError("Check your details.", 400, errors);
  const bumpIds = selectedBumpIds(body.bumpIds, resolved, { strict: true });
  const lines = linesFor(resolved, bumpIds);
  const attribution = normalizeAttribution(body.attribution as never);
  const { member, matchedExisting } = await resolveCheckoutMember({
    subAccountId: config.subAccountId,
    email: buyer.email,
    name: buyer.name,
    phone: buyer.phone || null,
    attribution,
  });
  // A retry (e.g. after a declined card) supersedes the buyer's previous
  // unpaid attempt on this same checkout, so it never lingers as a second
  // open payment. Only an unpaid order for the same checkout and email.
  if (typeof body.replacesOrderId === "string") await cancelSupersededOrder(body.replacesOrderId, config.id, buyer.email);
  const priced = await priceWithCoupon(resolved, lines, body.couponCode, member.id);
  if (priced.rejection) throw new CheckoutError(priced.rejection, 400, { couponCode: priced.rejection }, "coupon");
  const totals = priced.totals;
  // Paying is always a deliberate start too (covers buyers who never left the email field).
  const session = await startSession(resolved, buyer, body);

  const orderRef = ordersCol().doc();
  const now = Date.now();
  const items: CheckoutOrderItem[] = totals.lines.map((l) => ({
    offerId: l.offerId,
    role: l.role,
    bumpId: l.bumpId,
    title: l.title,
    billing: l.billing,
    unitAmountCents: l.unitAmountCents,
    discountCents: l.discountCents,
    dueTodayCents: l.dueTodayCents,
    purchaseId: null,
    fulfillment: "pending",
    fulfillmentError: null,
  }));
  const needsStripe = totals.dueTodayCents > 0 || totals.recurring !== null;
  const target = needsStripe ? await resolveStripeTarget(config.subAccountId, primary) : null;
  const publishableKey = target ? publishableKeyFor(target.paymentMode) : null;
  if (target && !publishableKey) throw new CheckoutError("Card payments aren't configured on this site yet.", 503, null, "payments_not_ready");

  const order: CheckoutOrder = {
    id: orderRef.id,
    agencyId: config.agencyId || primary.agencyId,
    subAccountId: config.subAccountId,
    configId: config.id,
    context: config.context,
    memberId: member.id,
    matchedExistingMember: matchedExisting,
    sessionId: session.sessionId,
    marketingOptIn: body.marketingOptIn === true && config.crm.marketingOptIn.enabled,
    crmCompletedAt: null,
    buyer,
    agreementAccepted,
    currency: totals.currency,
    items,
    coupon: priced.couponId && priced.code ? { couponId: priced.couponId, code: priced.code } : null,
    totals,
    paymentMode: target?.paymentMode ?? null,
    stripeAccountId: target?.accountId ?? null,
    stripeCustomerId: null,
    stripePaymentIntentId: null,
    stripeSetupIntentId: null,
    stripeSubscriptionId: null,
    stripeCouponIds: [],
    status: "pending",
    failureReason: null,
    paidAt: null,
    createdAt: now,
    updatedAt: now,
  };

  // Nothing to pay at all (free primary, or a 100% coupon on a one-time order).
  if (!target) {
    await orderRef.set(order);
    await linkOrderToSession(session.sessionId, order.id);
    const offers = new Map([[primary.id, primary], ...resolved.bumps.map((b) => [b.offer.id, b.offer] as const)]);
    await writePurchases(order, offers, attribution);
    const done = await completeOrder(order.id, { source: "free" });
    return { orderId: order.id, next: "redirect", redirectTo: done.redirectTo, totals };
  }

  order.stripeCustomerId = await stripeCustomerFor(target, member, buyer);
  await orderRef.set(order);
  await linkOrderToSession(session.sessionId, order.id);
  const offers = new Map([[primary.id, primary], ...resolved.bumps.map((b) => [b.offer.id, b.offer] as const)]);
  const metadata = { kind: CHECKOUT_ORDER_KIND, orderId: order.id, subAccountId: config.subAccountId, memberId: member.id, offerId: primary.id };

  try {
    let clientSecret: string;
    let intentType: "payment" | "setup";
    if (!totals.recurring) {
      const pi = await target.stripe.paymentIntents.create(
        {
          amount: totals.dueTodayCents,
          currency: totals.currency.toLowerCase(),
          customer: order.stripeCustomerId,
          automatic_payment_methods: { enabled: true },
          setup_future_usage: "off_session",
          description: primary.title.slice(0, 200),
          receipt_email: buyer.email,
          metadata,
        },
        { ...target.requestOptions, idempotencyKey: `order_${order.id}_pi` },
      );
      clientSecret = pi.client_secret!;
      intentType = "payment";
      await orderRef.update({ stripePaymentIntentId: pi.id, updatedAt: Date.now() });
    } else {
      const primaryLine = totals.lines[0];
      const couponIds: string[] = [];
      const primaryProduct = await stripeProductFor(target, primary);
      let primaryDiscount: Stripe.SubscriptionCreateParams.Item.Discount[] | undefined;
      if (primaryLine.discountCents > 0 && priced.pricing) {
        const id = await oneOffCoupon(target, primaryLine.discountCents, totals.currency, stripeDurationFor(priced.pricing.recurringDuration, primaryLine.trialDays), order.id);
        couponIds.push(id);
        primaryDiscount = [{ coupon: id }];
      }
      const addInvoiceItems: Stripe.SubscriptionCreateParams.AddInvoiceItem[] = [];
      for (const line of totals.lines.slice(1)) {
        if (line.unitAmountCents <= 0) continue;
        const product = await stripeProductFor(target, offers.get(line.offerId)!);
        let discounts: Stripe.SubscriptionCreateParams.AddInvoiceItem.Discount[] | undefined;
        if (line.discountCents > 0) {
          const id = await oneOffCoupon(target, line.discountCents, totals.currency, { duration: "once" }, order.id);
          couponIds.push(id);
          discounts = [{ coupon: id }];
        }
        addInvoiceItems.push({ price_data: { currency: totals.currency.toLowerCase(), product, unit_amount: line.unitAmountCents }, ...(discounts ? { discounts } : {}) });
      }
      const sub = await target.stripe.subscriptions.create(
        {
          customer: order.stripeCustomerId,
          items: [
            {
              price_data: { currency: totals.currency.toLowerCase(), product: primaryProduct, unit_amount: primaryLine.unitAmountCents, recurring: { interval: primaryLine.interval! } },
              ...(primaryDiscount ? { discounts: primaryDiscount } : {}),
            },
          ],
          ...(addInvoiceItems.length ? { add_invoice_items: addInvoiceItems } : {}),
          ...(primaryLine.trialDays > 0 ? { trial_period_days: primaryLine.trialDays } : {}),
          payment_behavior: "default_incomplete",
          payment_settings: { save_default_payment_method: "on_subscription" },
          metadata,
          expand: ["latest_invoice.confirmation_secret"],
        },
        { ...target.requestOptions, idempotencyKey: `order_${order.id}_sub` },
      );
      const invoice = sub.latest_invoice as Stripe.Invoice | null;
      if (!invoice || invoice.amount_due !== totals.dueTodayCents) {
        await target.stripe.subscriptions.cancel(sub.id, {}, target.requestOptions).catch(() => undefined);
        throw new CheckoutError("We couldn't prepare your payment. Try again.", 502);
      }
      // $0 due today (trial, nothing else charged): the subscription's own
      // pending SetupIntent carries fixed payment_method_types, which Stripe
      // refuses to confirm with a card collected by deferred Elements
      // (automatic payment methods). Use our own SetupIntent instead and make
      // its card the subscription default once it succeeds (verifyPaid).
      let setup: Stripe.SetupIntent | null = null;
      if (invoice.amount_due > 0) {
        clientSecret = invoice.confirmation_secret?.client_secret ?? "";
        intentType = "payment";
      } else {
        setup = await target.stripe.setupIntents.create(
          { customer: order.stripeCustomerId!, usage: "off_session", automatic_payment_methods: { enabled: true }, metadata },
          { ...target.requestOptions, idempotencyKey: `order_${order.id}_setup` },
        );
        clientSecret = setup.client_secret ?? "";
        intentType = "setup";
      }
      if (!clientSecret) throw new CheckoutError("We couldn't prepare your payment. Try again.", 502);
      await orderRef.update({ stripeSubscriptionId: sub.id, stripeSetupIntentId: setup?.id ?? null, stripeCouponIds: couponIds, updatedAt: Date.now() });
    }
    await writePurchases(order, offers, attribution);
    return {
      orderId: order.id,
      next: "pay",
      clientSecret,
      intentType,
      publishableKey: publishableKey!,
      stripeAccount: target.accountId,
      totals,
    };
  } catch (err) {
    await orderRef.update({ status: "failed", failureReason: err instanceof Error ? err.message.slice(0, 300) : "Payment setup failed", updatedAt: Date.now() });
    if (err instanceof CheckoutError) throw err;
    console.error("[checkout] start failed", err);
    throw new CheckoutError("We couldn't prepare your payment. Try again.", 502);
  }
}

async function writePurchases(order: CheckoutOrder, offers: Map<string, CourseOffer>, attribution: CourseOfferPurchase["attribution"]): Promise<void> {
  const items = [...order.items];
  for (const item of items) {
    // An all-free order's free primary goes through the normal free-Offer
    // enrollment (no purchase record), exactly like the classic enroll form.
    if (item.billing === "free" && order.totals.dueTodayCents === 0 && order.totals.recurring === null && items.every((i) => i.billing === "free")) continue;
    const offer = offers.get(item.offerId)!;
    const ref = purchasesCol(order.subAccountId, item.offerId).doc();
    await ref.set(purchaseDoc({ order, offer, item, attribution }));
    item.purchaseId = ref.id;
  }
  await ordersCol().doc(order.id).update({ items, updatedAt: Date.now() });
}

async function cancelSupersededOrder(orderId: string, configId: string, email: string): Promise<void> {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(orderId)) return;
  const ref = ordersCol().doc(orderId);
  const snap = await ref.get();
  const order = snap.data() as Omit<CheckoutOrder, "id"> | undefined;
  if (!order || order.status !== "pending" || order.configId !== configId || order.buyer.email !== email) return;
  try {
    // Never cancel something Stripe already collected money for.
    const verified = await verifyPaid({ id: orderId, ...order });
    if (verified.ok) return;
    if (order.paymentMode) {
      const stripe = getStripeServer(order.paymentMode);
      const opts = order.stripeAccountId ? { stripeAccount: order.stripeAccountId } : undefined;
      if (order.stripePaymentIntentId) await stripe.paymentIntents.cancel(order.stripePaymentIntentId, {}, opts).catch(() => undefined);
      if (order.stripeSubscriptionId) await stripe.subscriptions.cancel(order.stripeSubscriptionId, {}, opts).catch(() => undefined);
    }
    await ref.update({ status: "canceled", failureReason: "Replaced by a new attempt", updatedAt: Date.now() });
    for (const item of order.items) {
      if (item.purchaseId) await purchasesCol(order.subAccountId, item.offerId).doc(item.purchaseId).update({ status: "void" }).catch(() => undefined);
    }
  } catch (err) {
    console.warn("[checkout] could not cancel superseded order", orderId, err);
  }
}

/* ------------------------------- Completing ------------------------------ */

async function verifyPaid(order: CheckoutOrder): Promise<{ ok: boolean; reason?: string; paymentIntentId?: string | null; billing?: { city: string | null; state: string | null; country: string | null } }> {
  if (!order.paymentMode) return { ok: order.totals.dueTodayCents === 0 && order.totals.recurring === null };
  const stripe = getStripeServer(order.paymentMode);
  const opts = order.stripeAccountId ? { stripeAccount: order.stripeAccountId } : undefined;
  if (order.stripePaymentIntentId) {
    const pi = await stripe.paymentIntents.retrieve(order.stripePaymentIntentId, { expand: ["latest_charge"] }, opts);
    if (pi.status !== "succeeded" || pi.amount_received < order.totals.dueTodayCents || pi.metadata?.orderId !== order.id) return { ok: false, reason: pi.status };
    const charge = pi.latest_charge as Stripe.Charge | null;
    const a = charge?.billing_details?.address;
    return { ok: true, paymentIntentId: pi.id, billing: { city: a?.city ?? null, state: a?.state ?? null, country: a?.country ?? null } };
  }
  if (order.stripeSubscriptionId) {
    const sub = await stripe.subscriptions.retrieve(order.stripeSubscriptionId, { expand: ["latest_invoice"] }, opts);
    if (sub.metadata?.orderId !== order.id) return { ok: false, reason: "mismatch" };
    if (sub.status !== "active" && sub.status !== "trialing") return { ok: false, reason: sub.status };
    const invoice = sub.latest_invoice as Stripe.Invoice | null;
    if (!invoice || invoice.status !== "paid") return { ok: false, reason: "invoice_unpaid" };
    // A $0 first invoice (trial with nothing else due) is "paid" before the
    // buyer enters a card — the saved card is the real proof here.
    if (order.totals.dueTodayCents === 0) {
      if (!order.stripeSetupIntentId) return { ok: false, reason: "no_setup" };
      const si = await stripe.setupIntents.retrieve(order.stripeSetupIntentId, {}, opts);
      if (si.status !== "succeeded") return { ok: false, reason: si.status };
      if (si.metadata?.orderId !== order.id) return { ok: false, reason: "mismatch" };
      const pm = typeof si.payment_method === "string" ? si.payment_method : si.payment_method?.id;
      if (!pm) return { ok: false, reason: "no_payment_method" };
      const current = typeof sub.default_payment_method === "string" ? sub.default_payment_method : sub.default_payment_method?.id;
      if (current !== pm) await stripe.subscriptions.update(sub.id, { default_payment_method: pm }, opts);
    } else if (invoice.amount_paid < order.totals.dueTodayCents) return { ok: false, reason: "underpaid" };
    return { ok: true, paymentIntentId: null };
  }
  return { ok: false, reason: "no_intent" };
}

export interface CompleteResult {
  status: CheckoutOrder["status"] | "processing";
  redirectTo: string;
}

/**
 * Verify with Stripe and fulfil. Safe to call from the browser return, the
 * webhook, and retries at the same time: a short lock lets one caller grant,
 * each item is granted at most once, and the grant function itself is
 * idempotent for a purchase that is already paid.
 */
export async function completeOrder(orderId: string, opts: { source: "client" | "webhook" | "free"; eventAccountId?: string | null }): Promise<CompleteResult> {
  assertId(orderId, "order");
  const ref = ordersCol().doc(orderId);
  const snap = await ref.get();
  if (!snap.exists) throw new CheckoutError("Order not found.", 404);
  let order = { id: snap.id, ...(snap.data() as Omit<CheckoutOrder, "id">) };
  if (opts.source === "webhook" && (opts.eventAccountId ?? null) !== order.stripeAccountId) {
    throw new CheckoutError("Stripe account mismatch for this order.", 400);
  }
  if (order.status === "paid" && order.items.every((i) => i.fulfillment === "granted")) return { status: "paid", redirectTo: await destinationFor(order) };
  if (order.status === "failed" || order.status === "canceled") return { status: order.status, redirectTo: "" };

  const verified = await verifyPaid(order);
  if (!verified.ok) return { status: "processing", redirectTo: "" };

  const locked = await getAdminDb().runTransaction(async (tx) => {
    const fresh = await tx.get(ref);
    const lockUntil = (fresh.data()?.fulfillmentLockUntil as number | undefined) ?? 0;
    if (lockUntil > Date.now()) return false;
    tx.update(ref, { fulfillmentLockUntil: Date.now() + 60_000, status: "paid", paidAt: fresh.data()?.paidAt ?? Date.now(), updatedAt: Date.now() });
    return true;
  });
  if (!locked) return { status: "processing", redirectTo: "" };
  order = { id: orderId, ...((await ref.get()).data() as Omit<CheckoutOrder, "id">) };

  const items = [...order.items];
  for (const item of items) {
    if (item.fulfillment === "granted") continue;
    try {
      if (!item.purchaseId) {
        // All-free order: the classic free-Offer enrollment.
        const offer = await getCourseOffer(order.subAccountId, item.offerId);
        if (offer)
          await enrollAllCoursesForFreeOfferServerSide({
            subAccountId: order.subAccountId,
            agencyId: order.agencyId,
            courseIds: offer.courseIds,
            memberId: order.memberId,
            offerId: offer.id,
            offerTitle: offer.title,
            booking: offer.booking,
            communityAccess: offer.communityAccess ?? [],
            projectTemplates: offer.projectTemplates,
          });
      } else {
        const purchaseRef = purchasesCol(order.subAccountId, item.offerId).doc(item.purchaseId);
        const isSubscriptionItem = item.role === "primary" && item.billing === "recurring";
        await purchaseRef.update({
          stripeSubscriptionId: isSubscriptionItem ? order.stripeSubscriptionId : null,
          ...(verified.paymentIntentId ? { stripePaymentIntentId: verified.paymentIntentId } : {}),
        });
        await grantCourseOfferAccessServerSide({
          subAccountId: order.subAccountId,
          offerId: item.offerId,
          purchaseId: item.purchaseId,
          grantedByUid: null,
          stripeCustomerId: order.stripeCustomerId,
          ...(verified.paymentIntentId ? { stripePaymentIntentId: verified.paymentIntentId } : {}),
          billingCity: verified.billing?.city ?? null,
          billingState: verified.billing?.state ?? null,
          billingCountry: verified.billing?.country ?? null,
        });
      }
      item.fulfillment = "granted";
      item.fulfillmentError = null;
    } catch (err) {
      console.error(`[checkout] grant failed order=${orderId} offer=${item.offerId}`, err);
      item.fulfillment = "failed";
      item.fulfillmentError = err instanceof Error ? err.message.slice(0, 300) : "Grant failed";
    }
  }
  if (order.coupon) {
    await recordCouponRedemption({
      couponId: order.coupon.couponId,
      subAccountId: order.subAccountId,
      code: order.coupon.code,
      orderId,
      memberId: order.memberId,
      email: order.buyer.email,
      discountCents: order.totals.discountCents,
      orderTotalCents: order.totals.dueTodayCents,
      currency: order.currency,
    }).catch((err) => console.error("[checkout] coupon redemption record failed", err));
  }
  await ref.update({ items, fulfillmentLockUntil: 0, updatedAt: Date.now() });
  // CRM follow-up (tags, session completed, abandoned follow-up stopped,
  // checkout.completed) — once per order, never blocking the buyer.
  await completeCheckoutCrm({ ...order, items }).catch((err) => console.error("[checkout] CRM completion failed", err));
  return { status: "paid", redirectTo: await destinationFor({ ...order, items }) };
}

/** Where the buyer goes after paying, per the checkout's destination setting. */
async function destinationFor(order: CheckoutOrder): Promise<string> {
  const config = await getCheckoutConfigDoc(order.configId);
  const space = async () => {
    const sa = (await getAdminDb().doc(`subAccounts/${order.subAccountId}`).get()).data();
    const slug = (sa?.slug as string) || order.subAccountId;
    const next = encodeURIComponent(`/portal/${slug}`);
    // The member → MyMagnetix handoff only works for a member whose email is
    // proven on this device. Anyone else (a brand-new buyer whose email isn't
    // verified yet, or a returning buyer who typed their email without
    // signing in) goes to the normal sign-in page, which emails a link.
    const member = (await getAdminDb().doc(`subAccounts/${order.subAccountId}/members/${order.memberId}`).get()).data();
    if (order.matchedExistingMember || member?.emailVerified === false) return `/my/login?next=${next}`;
    return `/api/my/bridge-from-member?next=${next}`;
  };
  const d = config?.postPurchase ?? { type: "space" as const };
  if (d.type === "url") return d.url;
  if (d.type === "page") return `/p/${d.pageId}`;
  if ((d.type === "funnel_next_step" || d.type === "funnel_step") && order.context.type === "funnel_step") {
    const steps = (await getAdminDb().collection(`funnels/${order.context.funnelId}/steps`).get()).docs
      .map((s) => ({ id: s.id, ...(s.data() as { order: number; type: string; pageId: string | null; checkoutConfigId: string | null }) }))
      .sort((a, b) => a.order - b.order);
    const here = steps.findIndex((s) => s.id === (order.context as { stepId: string }).stepId);
    const target = d.type === "funnel_step" ? steps.find((s) => s.id === d.stepId) : steps[here + 1];
    // A checkout step with its own Page (Page Builder Checkout block) opens that Page.
  if (target?.type === "checkout" && target.pageId) return `/p/${target.pageId}`;
  if (target?.type === "checkout" && target.checkoutConfigId) return `/checkout/${target.checkoutConfigId}`;
    if (target?.pageId) return `/p/${target.pageId}`;
  }
  return space();
}

/** Public order status for the confirmation screen (no private data). */
export async function orderStatusForBuyer(orderId: string, configId: string): Promise<{ status: CompleteResult["status"]; redirectTo: string; matchedExistingMember: boolean; maskedEmail: string } | null> {
  assertId(orderId, "order");
  const snap = await ordersCol().doc(orderId).get();
  if (!snap.exists || snap.data()?.configId !== configId) return null;
  let order = { id: snap.id, ...(snap.data() as Omit<CheckoutOrder, "id">) };
  let result: CompleteResult = { status: order.status, redirectTo: "" };
  if (order.status === "pending" || (order.status === "paid" && order.items.some((i) => i.fulfillment !== "granted"))) {
    result = await completeOrder(orderId, { source: "client" });
    order = { id: snap.id, ...((await ordersCol().doc(orderId).get()).data() as Omit<CheckoutOrder, "id">) };
  } else if (order.status === "paid") {
    result = { status: "paid", redirectTo: await destinationFor(order) };
  }
  const [user, domain] = order.buyer.email.split("@");
  return {
    status: result.status,
    redirectTo: result.redirectTo,
    matchedExistingMember: order.matchedExistingMember,
    maskedEmail: `${user.slice(0, 2)}•••@${domain}`,
  };
}

/* -------------------------------- Webhooks ------------------------------- */

export async function handleCheckoutOrderPaymentIntent(pi: Stripe.PaymentIntent, eventAccountId: string | null): Promise<void> {
  const orderId = pi.metadata?.orderId;
  if (!orderId) return;
  await completeOrder(orderId, { source: "webhook", eventAccountId }).catch((err) => console.error("[checkout] webhook completion failed", err));
}

/** invoice.paid for a checkout-order subscription (first payment or later). */
export async function handleCheckoutOrderInvoicePaid(invoice: Stripe.Invoice, eventAccountId: string | null): Promise<void> {
  const meta = invoice.parent?.subscription_details?.metadata;
  if (meta?.kind !== CHECKOUT_ORDER_KIND || !meta.orderId) return;
  await completeOrder(meta.orderId, { source: "webhook", eventAccountId }).catch((err) => console.error("[checkout] webhook completion failed", err));
}

/** customer.subscription.updated — covers a trial whose card was saved with nothing due today. */
export async function handleCheckoutOrderSubscriptionUpdated(sub: Stripe.Subscription): Promise<void> {
  const orderId = sub.metadata?.orderId;
  if (!orderId) return;
  const snap = await ordersCol().doc(orderId).get();
  if (snap.data()?.status !== "pending") return;
  // Verified against Stripe on the order's own stored account.
  await completeOrder(orderId, { source: "client" }).catch((err) => console.error("[checkout] webhook completion failed", err));
}

export async function orderForAdmin(subAccountId: string, orderId: string): Promise<CheckoutOrder | null> {
  const snap = await ordersCol().doc(assertId(orderId, "order")).get();
  if (!snap.exists || snap.data()?.subAccountId !== subAccountId) return null;
  return { id: snap.id, ...(snap.data() as Omit<CheckoutOrder, "id">) };
}
