import "server-only";

import type Stripe from "stripe";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import { getStripeServer } from "@/lib/stripe/server";
import { applyFeatureGates } from "@/lib/server/feature-gates-service";
import {
  buildChargeCheckoutUrl,
  buildCheckoutUrl,
  issueChargeToken,
  issueCheckoutToken,
} from "@/lib/billing/token";
import { emitWebhookEvent } from "@/lib/api/webhooks/dispatch";
import { createSubAccountForAgency } from "@/lib/server/sub-accounts-service";
import { emailIsConfigured, sendEmail } from "@/lib/comms/resend";
import { resolveBrandName, resolveCustomBrand } from "@/lib/landing/resolve-brand";
import {
  BILLING_GRACE_DAYS,
  PLAN_GATE_KEYS,
  type BillingChargeDoc,
  type BillingChargeResponse,
  type BillingChargeStatus,
  type BillingInterval,
  type BillingPlanDoc,
  type BillingPlanResponse,
  type PlanGates,
  type SubAccountBilling,
  type SubAccountBillingStatus,
} from "@/types/billing";

/**
 * Client Billing v1 service — the single write path for agency plans
 * (`agencies/{agencyId}/plans/{planId}`) and per-sub-account billing state
 * (`subAccounts/{id}.billing`). Charges run on the deployment's own Stripe
 * account (one agency per deployment — no Connect). Auth stays with the
 * callers (owner-gated routes + the signature-verified Stripe webhook);
 * this module trusts its inputs.
 *
 * Stripe linkage:
 *   - plan create  → Product + recurring monthly Price
 *   - price edit   → NEW Price (immutable), old one deactivated; existing
 *                    subscriptions keep the price they signed up at
 *   - special price → one-off Price on the plan's Product, scoped to one
 *                    sub-account via metadata
 *   - checkout     → mode:"subscription", `metadata.kind = "subAccountPlan"`
 *                    stamped on BOTH the session and the subscription so the
 *                    webhook can route without ever colliding with the
 *                    legacy founders / user-subscription branches
 */

export const SUB_ACCOUNT_PLAN_KIND = "subAccountPlan";
/** metadata.kind for ONE-TIME charges (mode:"payment" checkouts). */
export const SUB_ACCOUNT_CHARGE_KIND = "subAccountCharge";
/**
 * metadata.kind for the PUBLIC Magnetix SaaS Signup checkout — a stranger
 * buying a publicly-purchasable Agency Plan with no pre-existing sub-account
 * (see `createPlatformSignupCheckoutSession` / `handlePlatformSignupCheckoutCompleted`
 * below). Deliberately a NEW kind rather than reusing `SUB_ACCOUNT_PLAN_KIND`
 * at session-creation time, because no `subAccountId` exists yet to stamp —
 * `handlePlatformSignupCheckoutCompleted` re-tags the resulting Stripe
 * subscription's metadata to `SUB_ACCOUNT_PLAN_KIND` once the sub-account is
 * created, so every subscription event AFTER provisioning flows through the
 * existing, unmodified `handleSubAccountSubscriptionEvent` sync path.
 */
export const PLATFORM_SIGNUP_KIND = "platformSignup";

/** Stripe's practical floor for a recurring charge, in cents. */
const MIN_PRICE_CENTS = 100;
const MAX_PRICE_CENTS = 100_000_000;

export function billingStripeIsConfigured(): boolean {
  return !!process.env.STRIPE_SECRET_KEY?.trim();
}

export class BillingError extends Error {
  readonly status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "BillingError";
    this.status = status;
  }
}

function plansCollection(agencyId: string) {
  return getAdminDb().collection(`agencies/${agencyId}/plans`);
}

/**
 * Append-only billing audit trail (top-level `billingEvents`, mirroring the
 * aiSuiteActions pattern): one row per assignment, comp, activation, and
 * dunning transition, so "who put this client on what, when" is answerable
 * without spelunking Stripe. Best-effort — never blocks the primary write.
 */
function recordBillingEvent(entry: {
  agencyId: string;
  subAccountId: string;
  event:
    | "plan.assigned"
    | "plan.switched"
    | "comped"
    | "activated"
    | "status.changed"
    | "charge.created"
    | "charge.paid"
    | "charge.canceled";
  detail: Record<string, unknown>;
}): void {
  getAdminDb()
    .collection("billingEvents")
    .add({
      ...entry,
      createdAt: FieldValue.serverTimestamp(),
    })
    .catch((err) =>
      console.warn("[billing] failed to record billing event", err),
    );
}

function tsToIso(value: unknown): string | null {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  return null;
}

/** Full shareable public-signup URL for a plan. Empty when
 *  NEXT_PUBLIC_APP_URL is unset (mirrors buildCheckoutUrl's convention). */
export function buildPublicPlanUrl(publicSlug: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  if (!base) return "";
  return `${base}/get-started/${publicSlug}`;
}

function serializePlan(
  id: string,
  data: FirebaseFirestore.DocumentData,
): BillingPlanResponse {
  const gates = {} as PlanGates;
  for (const key of PLAN_GATE_KEYS) {
    gates[key] = data.gates?.[key] === true;
  }
  const publiclyPurchasable = data.publiclyPurchasable === true;
  const publicSlug = (data.publicSlug as string | null) ?? null;
  return {
    id,
    name: String(data.name ?? ""),
    description: (data.description as string | null) ?? null,
    priceMonthlyCents: Number(data.priceMonthlyCents ?? 0),
    priceAnnualCents:
      data.priceAnnualCents != null ? Number(data.priceAnnualCents) : null,
    currency: String(data.currency ?? "usd"),
    gates,
    status: data.status === "archived" ? "archived" : "active",
    publiclyPurchasable,
    publicSlug,
    publicSaleUrl:
      publiclyPurchasable && publicSlug ? buildPublicPlanUrl(publicSlug) || null : null,
    createdAt: tsToIso(data.createdAt),
    updatedAt: tsToIso(data.updatedAt),
  };
}

/** kebab-case a plan name for use as the base of a public slug. Falls back
 *  to "plan" if the name has no ASCII-alnum characters at all (e.g. an
 *  emoji-only name) so slug generation never produces an empty string. */
function slugifyPlanName(name: string): string {
  const slug = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return slug || "plan";
}

/**
 * Generate a `publicSlug` that's unique within this agency's plans, from the
 * plan's current name. Called once, lazily, the first time a plan is turned
 * publicly purchasable (see `updatePlanForAgency`) — never regenerated after
 * that, so an already-shared link stays valid even if the plan is renamed.
 */
async function generateUniquePublicSlug(
  agencyId: string,
  name: string,
): Promise<string> {
  const base = slugifyPlanName(name);
  const col = plansCollection(agencyId);
  let candidate = base;
  let suffix = 2;
  // Small, bounded loop — an agency has at most a handful of plans, so this
  // is at most a few extra reads even in a pathological all-same-name case.
  while (suffix < 100) {
    const existing = await col.where("publicSlug", "==", candidate).limit(1).get();
    if (existing.empty) return candidate;
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  // Astronomically unlikely fallback: fold in a short random suffix.
  return `${base}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Normalize an untrusted gates payload into a full PlanGates record. */
export function normalizePlanGates(input: unknown): PlanGates {
  const source = (input ?? {}) as Record<string, unknown>;
  const gates = {} as PlanGates;
  for (const key of PLAN_GATE_KEYS) {
    gates[key] = source[key] === true;
  }
  return gates;
}

export function validatePlanPricing(
  priceMonthlyCents: unknown,
  currency: unknown,
): { priceMonthlyCents: number; currency: string } {
  if (
    typeof priceMonthlyCents !== "number" ||
    !Number.isInteger(priceMonthlyCents) ||
    priceMonthlyCents < MIN_PRICE_CENTS ||
    priceMonthlyCents > MAX_PRICE_CENTS
  ) {
    throw new BillingError(
      `priceMonthlyCents must be an integer between ${MIN_PRICE_CENTS} and ${MAX_PRICE_CENTS}.`,
    );
  }
  const cur = typeof currency === "string" ? currency.trim().toLowerCase() : "";
  if (!/^[a-z]{3}$/.test(cur)) {
    throw new BillingError(
      'currency must be a 3-letter ISO code (e.g. "usd", "aud").',
    );
  }
  return { priceMonthlyCents, currency: cur };
}

/**
 * Validate the OPTIONAL annual price. Accepts `null`/`undefined` (monthly-only)
 * or an integer in the Stripe range. Returns the normalized value: `undefined`
 * means "no change" (edit path), `null` means "monthly-only", a number sets it.
 */
export function validateAnnualPrice(
  priceAnnualCents: unknown,
): number | null | undefined {
  if (priceAnnualCents === undefined) return undefined;
  if (priceAnnualCents === null) return null;
  if (
    typeof priceAnnualCents !== "number" ||
    !Number.isInteger(priceAnnualCents) ||
    priceAnnualCents < MIN_PRICE_CENTS ||
    priceAnnualCents > MAX_PRICE_CENTS
  ) {
    throw new BillingError(
      `priceAnnualCents must be null or an integer between ${MIN_PRICE_CENTS} and ${MAX_PRICE_CENTS}.`,
    );
  }
  return priceAnnualCents;
}

// ---------------------------------------------------------------------------
// Plans
// ---------------------------------------------------------------------------

export async function listPlansForAgency(
  agencyId: string,
): Promise<BillingPlanResponse[]> {
  const snap = await plansCollection(agencyId).get();
  return snap.docs
    .map((d) => serializePlan(d.id, d.data()))
    .sort((a, b) => a.priceMonthlyCents - b.priceMonthlyCents);
}

export async function createPlanForAgency(input: {
  agencyId: string;
  name: string;
  description: string | null;
  priceMonthlyCents: number;
  /** Optional annual price; null = monthly-only. */
  priceAnnualCents: number | null;
  currency: string;
  gates: PlanGates;
}): Promise<BillingPlanResponse> {
  if (!billingStripeIsConfigured()) {
    throw new BillingError(
      "Stripe isn't configured on this deployment. Set STRIPE_SECRET_KEY to create plans.",
      503,
    );
  }
  const stripe = getStripeServer();
  const ref = plansCollection(input.agencyId).doc();

  const product = await stripe.products.create({
    name: input.name,
    ...(input.description ? { description: input.description } : {}),
    metadata: {
      kind: SUB_ACCOUNT_PLAN_KIND,
      agencyId: input.agencyId,
      planId: ref.id,
    },
  });
  const price = await stripe.prices.create({
    product: product.id,
    unit_amount: input.priceMonthlyCents,
    currency: input.currency,
    recurring: { interval: "month" },
    metadata: { planId: ref.id },
  });

  // Optional annual price — a second recurring Price on the same Product.
  let annualPriceId: string | null = null;
  if (input.priceAnnualCents !== null) {
    const annual = await stripe.prices.create({
      product: product.id,
      unit_amount: input.priceAnnualCents,
      currency: input.currency,
      recurring: { interval: "year" },
      metadata: { planId: ref.id, interval: "year" },
    });
    annualPriceId = annual.id;
  }

  await ref.set({
    id: ref.id,
    agencyId: input.agencyId,
    name: input.name,
    description: input.description,
    priceMonthlyCents: input.priceMonthlyCents,
    priceAnnualCents: input.priceAnnualCents,
    currency: input.currency,
    gates: input.gates,
    status: "active",
    stripeProductId: product.id,
    stripePriceId: price.id,
    stripeAnnualPriceId: annualPriceId,
    // Public sale is always OFF at creation — the agency owner must
    // intentionally opt a plan into self-serve signup from Agency → Billing,
    // never inferred from status === "active" (a plan can be active and
    // still manually-assignment-only).
    publiclyPurchasable: false,
    publicSlug: null,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  const snap = await ref.get();
  return serializePlan(ref.id, snap.data() ?? {});
}

export async function updatePlanForAgency(input: {
  agencyId: string;
  planId: string;
  name?: string;
  description?: string | null;
  priceMonthlyCents?: number;
  /** undefined = no change; null = remove annual; number = set/change annual. */
  priceAnnualCents?: number | null;
  gates?: PlanGates;
  status?: "active" | "archived";
  /**
   * Public Magnetix SaaS Signup toggle. `true` enables self-serve purchase
   * at `/get-started/{publicSlug}`, generating that slug on first enable if
   * the plan doesn't have one yet (see `generateUniquePublicSlug`). `false`
   * disables public purchase immediately — the slug is kept (not cleared),
   * so re-enabling later doesn't break a link someone already has, and a
   * disabled plan's URL resolves to "not available" rather than 404,
   * matching `resolvePublicPlan`'s status+publiclyPurchasable check.
   */
  publiclyPurchasable?: boolean;
}): Promise<BillingPlanResponse> {
  const ref = plansCollection(input.agencyId).doc(input.planId);
  const snap = await ref.get();
  if (!snap.exists) throw new BillingError("Plan not found", 404);
  const plan = snap.data() as BillingPlanDoc & Record<string, unknown>;

  const updates: Record<string, unknown> = {
    updatedAt: FieldValue.serverTimestamp(),
  };
  if (typeof input.name === "string") updates.name = input.name;
  if (input.description !== undefined) updates.description = input.description;
  if (input.gates) updates.gates = input.gates;
  if (input.status) updates.status = input.status;
  if (typeof input.publiclyPurchasable === "boolean") {
    if (input.publiclyPurchasable && plan.status === "archived" && !input.status) {
      throw new BillingError(
        "An archived plan can't be made publicly purchasable — unarchive it first.",
      );
    }
    updates.publiclyPurchasable = input.publiclyPurchasable;
    if (input.publiclyPurchasable && !plan.publicSlug) {
      updates.publicSlug = await generateUniquePublicSlug(
        input.agencyId,
        (typeof input.name === "string" ? input.name : plan.name) as string,
      );
    }
  }

  const stripe = billingStripeIsConfigured() ? getStripeServer() : null;

  // Price change → mint a NEW Stripe Price and deactivate the old one.
  // Existing subscriptions keep the price they signed up at (standard
  // Stripe behavior); only new checkouts see the new amount.
  if (
    typeof input.priceMonthlyCents === "number" &&
    input.priceMonthlyCents !== plan.priceMonthlyCents
  ) {
    if (!stripe || !plan.stripeProductId) {
      throw new BillingError(
        "Stripe isn't configured — can't change the plan price.",
        503,
      );
    }
    const price = await stripe.prices.create({
      product: plan.stripeProductId,
      unit_amount: input.priceMonthlyCents,
      currency: plan.currency,
      recurring: { interval: "month" },
      metadata: { planId: input.planId },
    });
    if (plan.stripePriceId) {
      await stripe.prices
        .update(plan.stripePriceId, { active: false })
        .catch((err) =>
          console.warn("[billing] failed to deactivate old price", err),
        );
    }
    updates.priceMonthlyCents = input.priceMonthlyCents;
    updates.stripePriceId = price.id;
  }

  // Annual price change — add, change, or remove the interval=year Price.
  // undefined = untouched; null = remove (monthly-only); number = set/change.
  const currentAnnual = (plan.priceAnnualCents as number | null | undefined) ?? null;
  if (
    input.priceAnnualCents !== undefined &&
    input.priceAnnualCents !== currentAnnual
  ) {
    if (!stripe || !plan.stripeProductId) {
      throw new BillingError(
        "Stripe isn't configured — can't change the annual price.",
        503,
      );
    }
    if (input.priceAnnualCents === null) {
      // Remove annual: deactivate the old yearly Price, clear the fields.
      if (plan.stripeAnnualPriceId) {
        await stripe.prices
          .update(plan.stripeAnnualPriceId, { active: false })
          .catch((err) =>
            console.warn("[billing] failed to deactivate annual price", err),
          );
      }
      updates.priceAnnualCents = null;
      updates.stripeAnnualPriceId = null;
    } else {
      // Set or change annual: mint a new yearly Price, deactivate the old one.
      const annual = await stripe.prices.create({
        product: plan.stripeProductId,
        unit_amount: input.priceAnnualCents,
        currency: plan.currency,
        recurring: { interval: "year" },
        metadata: { planId: input.planId, interval: "year" },
      });
      if (plan.stripeAnnualPriceId) {
        await stripe.prices
          .update(plan.stripeAnnualPriceId, { active: false })
          .catch((err) =>
            console.warn("[billing] failed to deactivate old annual price", err),
          );
      }
      updates.priceAnnualCents = input.priceAnnualCents;
      updates.stripeAnnualPriceId = annual.id;
    }
  }

  // Keep the Stripe Product's display fields in sync (best-effort).
  if (
    stripe &&
    plan.stripeProductId &&
    (typeof input.name === "string" || input.description !== undefined)
  ) {
    await stripe.products
      .update(plan.stripeProductId, {
        ...(typeof input.name === "string" ? { name: input.name } : {}),
        ...(input.description !== undefined
          ? { description: input.description ?? "" }
          : {}),
      })
      .catch((err) =>
        console.warn("[billing] failed to sync Stripe product", err),
      );
  }

  // Archive → deactivate the standard price(s) so no new checkout can use them.
  if (input.status === "archived" && stripe) {
    if (plan.stripePriceId) {
      await stripe.prices
        .update(plan.stripePriceId, { active: false })
        .catch((err) =>
          console.warn("[billing] failed to deactivate archived price", err),
        );
    }
    if (plan.stripeAnnualPriceId) {
      await stripe.prices
        .update(plan.stripeAnnualPriceId, { active: false })
        .catch((err) =>
          console.warn(
            "[billing] failed to deactivate archived annual price",
            err,
          ),
        );
    }
  }

  await ref.update(updates);

  // Gate edits propagate to every sub-account currently ON this plan —
  // the plan is the source of truth for a managed client's gates. Comped /
  // unmanaged sub-accounts are untouched.
  if (input.gates) {
    const subs = await getAdminDb()
      .collection("subAccounts")
      .where("billing.planId", "==", input.planId)
      .get();
    for (const doc of subs.docs) {
      if (doc.data().agencyId !== input.agencyId) continue;
      const status = doc.data().billing?.status as
        | SubAccountBillingStatus
        | undefined;
      // Pending clients get gates at activation; everyone else re-applies now.
      if (status === "active" || status === "past_due") {
        await applyFeatureGates(doc.id, input.gates).catch((err) =>
          console.warn(
            `[billing] gate re-apply failed for sub-account ${doc.id}`,
            err,
          ),
        );
      }
    }
  }

  const updated = await ref.get();
  return serializePlan(ref.id, updated.data() ?? {});
}

async function getPlanOrThrow(
  agencyId: string,
  planId: string,
): Promise<BillingPlanDoc> {
  const snap = await plansCollection(agencyId).doc(planId).get();
  if (!snap.exists) throw new BillingError("Plan not found", 404);
  return { ...(snap.data() as BillingPlanDoc), id: snap.id };
}

// ---------------------------------------------------------------------------
// Assignment / comp / checkout links
// ---------------------------------------------------------------------------

async function getSubInAgencyOrThrow(agencyId: string, subAccountId: string) {
  const ref = getAdminDb().doc(`subAccounts/${subAccountId}`);
  const snap = await ref.get();
  if (!snap.exists || snap.data()?.agencyId !== agencyId) {
    throw new BillingError("Sub-account not found", 404);
  }
  return { ref, data: snap.data() as Record<string, unknown> };
}

function readBilling(
  data: Record<string, unknown>,
): SubAccountBilling | null {
  return (data.billing as SubAccountBilling | null | undefined) ?? null;
}

/**
 * Resolve the Stripe Price a checkout/subscription should use: the plan's
 * standard price, or a freshly-minted one-off "special price" scoped to
 * this sub-account (GHL's per-client Special Price).
 */
async function resolveStripePrice(
  plan: BillingPlanDoc,
  subAccountId: string,
  specialPriceCents: number | null,
  interval: BillingInterval,
): Promise<string> {
  if (!plan.stripeProductId) {
    throw new BillingError(
      "This plan has no Stripe product — recreate it with Stripe configured.",
      500,
    );
  }
  const basePriceId =
    interval === "year" ? plan.stripeAnnualPriceId : plan.stripePriceId;
  if (interval === "year" && !basePriceId) {
    throw new BillingError(
      "This plan has no annual price — add one on the plan, or assign it monthly.",
    );
  }
  if (!basePriceId) {
    throw new BillingError(
      "This plan has no Stripe price — recreate it with Stripe configured.",
      500,
    );
  }
  if (specialPriceCents === null) return basePriceId;
  // One-off special price minted at the SAME interval so the cadence matches.
  const stripe = getStripeServer();
  const price = await stripe.prices.create({
    product: plan.stripeProductId,
    unit_amount: specialPriceCents,
    currency: plan.currency,
    recurring: { interval },
    metadata: {
      planId: plan.id,
      specialForSubAccountId: subAccountId,
      interval,
    },
  });
  return price.id;
}

export interface AssignPlanResult {
  status: SubAccountBillingStatus;
  /** Fresh checkout URL (only when the sub-account still needs to pay). */
  checkoutUrl: string | null;
}

/**
 * Assign (or switch) a plan.
 *
 *  - No live subscription → billing goes "pending" + a fresh checkout link
 *    is minted. Gates apply at activation, not before.
 *  - Live subscription (active/past_due) → the Stripe subscription's single
 *    item is moved to the new price (prorated) and the new plan's gates
 *    apply immediately.
 */
export async function assignPlanToSubAccount(input: {
  agencyId: string;
  subAccountId: string;
  planId: string;
  specialPriceCents: number | null;
  /** Billing cadence the agency picked. Defaults to monthly. */
  interval?: BillingInterval;
}): Promise<AssignPlanResult> {
  if (!billingStripeIsConfigured()) {
    throw new BillingError(
      "Stripe isn't configured on this deployment. Set STRIPE_SECRET_KEY first.",
      503,
    );
  }
  const interval: BillingInterval = input.interval === "year" ? "year" : "month";
  const plan = await getPlanOrThrow(input.agencyId, input.planId);
  if (plan.status !== "active") {
    throw new BillingError("This plan is archived — unarchive it or pick another.");
  }
  if (interval === "year" && plan.priceAnnualCents == null) {
    throw new BillingError(
      "This plan doesn't offer annual billing — add an annual price or assign it monthly.",
    );
  }
  if (input.specialPriceCents !== null) {
    if (
      !Number.isInteger(input.specialPriceCents) ||
      input.specialPriceCents < MIN_PRICE_CENTS ||
      input.specialPriceCents > MAX_PRICE_CENTS
    ) {
      throw new BillingError("specialPriceCents is out of range.");
    }
  }

  const { ref, data } = await getSubInAgencyOrThrow(
    input.agencyId,
    input.subAccountId,
  );
  const billing = readBilling(data);
  const basePriceCents =
    interval === "year"
      ? (plan.priceAnnualCents as number)
      : plan.priceMonthlyCents;
  const priceCents = input.specialPriceCents ?? basePriceCents;
  const stripePriceId = await resolveStripePrice(
    plan,
    input.subAccountId,
    input.specialPriceCents,
    interval,
  );

  const hasLiveSubscription =
    !!billing?.stripeSubscriptionId &&
    (billing.status === "active" || billing.status === "past_due");

  if (hasLiveSubscription) {
    // Plan switch on a live subscription: move the single item to the new
    // price with standard prorations.
    const stripe = getStripeServer();
    const sub = await stripe.subscriptions.retrieve(
      billing.stripeSubscriptionId as string,
    );
    const item = sub.items.data[0];
    if (!item) {
      throw new BillingError(
        "The Stripe subscription has no items — resolve it in the Stripe dashboard.",
        500,
      );
    }
    await stripe.subscriptions.update(sub.id, {
      items: [{ id: item.id, price: stripePriceId }],
      proration_behavior: "create_prorations",
      metadata: {
        kind: SUB_ACCOUNT_PLAN_KIND,
        agencyId: input.agencyId,
        subAccountId: input.subAccountId,
        planId: plan.id,
      },
    });

    await ref.update({
      "billing.planId": plan.id,
      "billing.planName": plan.name,
      "billing.priceCents": priceCents,
      "billing.billingInterval": interval,
      "billing.currency": plan.currency,
      "billing.specialPriceCents": input.specialPriceCents,
      "billing.stripePriceId": stripePriceId,
      "billing.updatedAt": FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    await applyFeatureGates(input.subAccountId, plan.gates);

    recordBillingEvent({
      agencyId: input.agencyId,
      subAccountId: input.subAccountId,
      event: "plan.switched",
      detail: { planId: plan.id, planName: plan.name, priceCents },
    });
    void emitWebhookEvent({
      subAccountId: input.subAccountId,
      agencyId: input.agencyId,
      mode: "live",
      type: "billing.plan.assigned",
      payload: {
        subAccountId: input.subAccountId,
        planId: plan.id,
        planName: plan.name,
        priceCents,
        currency: plan.currency,
        status: billing?.status ?? "active",
      },
    });
    return { status: billing?.status ?? "active", checkoutUrl: null };
  }

  // Fresh assignment (or re-assignment after cancel): pending + link.
  const { token, hash } = issueCheckoutToken(input.subAccountId);
  const next: Record<string, unknown> = {
    billing: {
      status: "pending" satisfies SubAccountBillingStatus,
      planId: plan.id,
      planName: plan.name,
      priceCents,
      billingInterval: interval,
      currency: plan.currency,
      specialPriceCents: input.specialPriceCents,
      stripePriceId,
      stripeCustomerId: billing?.stripeCustomerId ?? null,
      stripeSubscriptionId: null,
      checkoutTokenHash: hash,
      graceUntil: null,
      assignedAt: FieldValue.serverTimestamp(),
      activatedAt: billing?.activatedAt ?? null,
      updatedAt: FieldValue.serverTimestamp(),
    },
    updatedAt: FieldValue.serverTimestamp(),
  };
  await ref.update(next);

  recordBillingEvent({
    agencyId: input.agencyId,
    subAccountId: input.subAccountId,
    event: "plan.assigned",
    detail: {
      planId: plan.id,
      planName: plan.name,
      priceCents,
      specialPriceCents: input.specialPriceCents,
    },
  });
  void emitWebhookEvent({
    subAccountId: input.subAccountId,
    agencyId: input.agencyId,
    mode: "live",
    type: "billing.plan.assigned",
    payload: {
      subAccountId: input.subAccountId,
      planId: plan.id,
      planName: plan.name,
      priceCents,
      currency: plan.currency,
      status: "pending",
    },
  });

  return { status: "pending", checkoutUrl: buildCheckoutUrl(token) };
}

/**
 * Mark a sub-account comped: cancel any live Stripe subscription
 * immediately and return gate control to manual. Data + gates untouched.
 */
export async function compSubAccount(input: {
  agencyId: string;
  subAccountId: string;
}): Promise<void> {
  const { ref, data } = await getSubInAgencyOrThrow(
    input.agencyId,
    input.subAccountId,
  );
  const billing = readBilling(data);

  if (billing?.stripeSubscriptionId && billingStripeIsConfigured()) {
    await getStripeServer()
      .subscriptions.cancel(billing.stripeSubscriptionId)
      .catch((err) => {
        // Already-canceled/missing subscriptions shouldn't block the comp.
        console.warn("[billing] cancel-on-comp failed (continuing)", err);
      });
  }

  await ref.update({
    billing: {
      status: "comped" satisfies SubAccountBillingStatus,
      planId: null,
      planName: null,
      priceCents: null,
      billingInterval: null,
      currency: null,
      specialPriceCents: null,
      stripePriceId: null,
      stripeCustomerId: billing?.stripeCustomerId ?? null,
      stripeSubscriptionId: null,
      checkoutTokenHash: null,
      graceUntil: null,
      assignedAt: billing?.assignedAt ?? null,
      activatedAt: billing?.activatedAt ?? null,
      updatedAt: FieldValue.serverTimestamp(),
    },
    updatedAt: FieldValue.serverTimestamp(),
  });

  recordBillingEvent({
    agencyId: input.agencyId,
    subAccountId: input.subAccountId,
    event: "comped",
    detail: {
      previousStatus: billing?.status ?? null,
      canceledSubscription: billing?.stripeSubscriptionId ?? null,
    },
  });
}

/** Rotate the checkout token and return a fresh /pay URL. */
export async function mintCheckoutLink(input: {
  agencyId: string;
  subAccountId: string;
}): Promise<string> {
  const { ref, data } = await getSubInAgencyOrThrow(
    input.agencyId,
    input.subAccountId,
  );
  const billing = readBilling(data);
  if (!billing || billing.status === "comped" || !billing.planId) {
    throw new BillingError("Assign a plan before generating a checkout link.");
  }
  if (billing.status === "active") {
    throw new BillingError(
      "This client already has an active subscription — use the billing portal for card changes.",
    );
  }
  const { token, hash } = issueCheckoutToken(input.subAccountId);
  await ref.update({
    "billing.checkoutTokenHash": hash,
    "billing.updatedAt": FieldValue.serverTimestamp(),
  });
  return buildCheckoutUrl(token);
}

// ---------------------------------------------------------------------------
// Checkout session (used by /pay/[token] and the in-app activation screen)
// ---------------------------------------------------------------------------

export async function createSubAccountCheckoutSession(input: {
  subAccountId: string;
  /** Where Stripe returns the buyer. */
  successUrl: string;
  cancelUrl: string;
}): Promise<{ url: string }> {
  if (!billingStripeIsConfigured()) {
    throw new BillingError("Stripe isn't configured on this deployment.", 503);
  }
  const db = getAdminDb();
  const ref = db.doc(`subAccounts/${input.subAccountId}`);
  const snap = await ref.get();
  if (!snap.exists) throw new BillingError("Sub-account not found", 404);
  const data = snap.data() as Record<string, unknown>;
  const billing = readBilling(data);

  if (!billing || !billing.planId || !billing.stripePriceId) {
    throw new BillingError("No plan is assigned to this workspace.", 409);
  }
  if (billing.status === "active") {
    throw new BillingError("This subscription is already active.", 409);
  }
  if (billing.status === "comped") {
    throw new BillingError("This workspace isn't billed through checkout.", 409);
  }

  const stripe = getStripeServer();
  const agencyId = String(data.agencyId ?? "");

  // One Stripe customer per sub-account, reused across re-checkouts so
  // payment history stays attached to the client.
  let customerId = billing.stripeCustomerId;
  if (!customerId) {
    const contact = data.accountContact as {
      name?: string | null;
      email?: string | null;
    } | null;
    const customer = await stripe.customers.create({
      name: String(data.name ?? "Sub-account"),
      ...(contact?.email ? { email: contact.email } : {}),
      metadata: {
        kind: SUB_ACCOUNT_PLAN_KIND,
        agencyId,
        subAccountId: input.subAccountId,
      },
    });
    customerId = customer.id;
    await ref.update({
      "billing.stripeCustomerId": customerId,
      "billing.updatedAt": FieldValue.serverTimestamp(),
    });
  }

  const metadata = {
    kind: SUB_ACCOUNT_PLAN_KIND,
    agencyId,
    subAccountId: input.subAccountId,
    planId: billing.planId,
  };
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: billing.stripePriceId, quantity: 1 }],
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    metadata,
    subscription_data: { metadata },
  });
  if (!session.url) {
    throw new BillingError("Stripe did not return a checkout URL.", 502);
  }
  return { url: session.url };
}

// ---------------------------------------------------------------------------
// Public Magnetix SaaS Signup (Part 3/4 of the implementation task) — a
// stranger buying a publicly-purchasable Agency Plan with NO pre-existing
// sub-account. Two halves: resolve + create-checkout-session here (called
// from the public /get-started page + /api/checkout/platform-signup), and
// the webhook fulfillment handler further below.
// ---------------------------------------------------------------------------

/**
 * Resolve a plan by its public slug for the public signup surfaces. Returns
 * `null` — never throws, never distinguishes "doesn't exist" from "exists
 * but not public" to the caller — for: no matching slug, archived plan, or
 * `publiclyPurchasable !== true`. This is the SINGLE authoritative check
 * both the public entry page (display) and the checkout-session endpoint
 * (server-side price resolution) use, so they can never drift.
 *
 * Deliberately a single-field `where("publicSlug", "==", …)` query (no
 * compound filter) so this needs no new Firestore composite index — the
 * status/publiclyPurchasable check happens in code after the read.
 */
export async function resolvePublicPlan(
  agencyId: string,
  publicSlug: string,
): Promise<BillingPlanDoc | null> {
  if (!agencyId || !publicSlug) return null;
  const snap = await plansCollection(agencyId)
    .where("publicSlug", "==", publicSlug)
    .limit(1)
    .get();
  if (snap.empty) return null;
  const doc = snap.docs[0];
  const plan = { ...(doc.data() as BillingPlanDoc), id: doc.id };
  if (plan.status !== "active" || plan.publiclyPurchasable !== true) return null;
  return plan;
}

export interface PlatformSignupAttribution {
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmContent: string | null;
  utmTerm: string | null;
  referrer: string | null;
}

/** Stripe metadata values are capped at 500 chars; keep everything well
 *  under that and drop empties so metadata stays small and readable. */
function truncateForMetadata(value: string | null | undefined, max = 200): string {
  if (!value) return "";
  return value.trim().slice(0, max);
}

/**
 * Create the public-signup Stripe Checkout Session. Every billing object
 * (plan, price, currency, agencyId) is resolved server-side from
 * `resolvePublicPlan` — the caller supplies only a slug + cadence + the
 * buyer's own contact details, never a price or agency id, so a tampered
 * request can at worst buy the SAME plan at its SAME real price, never an
 * arbitrary one. Runs on the PLATFORM Stripe client (no `stripeAccount` —
 * same client Client Billing v1's own checkout uses) — this is Magnetix
 * Studios billing a business owner, never Stripe Connect.
 */
export async function createPlatformSignupCheckoutSession(input: {
  agencyId: string;
  planSlug: string;
  interval: BillingInterval;
  buyerEmail: string;
  businessName: string;
  attribution: PlatformSignupAttribution;
}): Promise<{ url: string }> {
  if (!billingStripeIsConfigured()) {
    throw new BillingError("Stripe isn't configured on this deployment.", 503);
  }
  const base = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  if (!base) {
    throw new BillingError("NEXT_PUBLIC_APP_URL isn't configured.", 500);
  }

  const plan = await resolvePublicPlan(input.agencyId, input.planSlug);
  if (!plan) {
    throw new BillingError("This plan isn't available for signup.", 404);
  }
  if (input.interval === "year" && plan.priceAnnualCents == null) {
    throw new BillingError("This plan doesn't offer annual billing.", 400);
  }
  const stripePriceId =
    input.interval === "year" ? plan.stripeAnnualPriceId : plan.stripePriceId;
  if (!stripePriceId) {
    throw new BillingError(
      "This plan has no Stripe price configured — contact support.",
      500,
    );
  }

  const stripe = getStripeServer();
  const metadata: Record<string, string> = {
    kind: PLATFORM_SIGNUP_KIND,
    agencyId: input.agencyId,
    planId: plan.id,
    interval: input.interval,
    buyerEmail: input.buyerEmail,
    businessName: truncateForMetadata(input.businessName, 120),
    utmSource: truncateForMetadata(input.attribution.utmSource),
    utmMedium: truncateForMetadata(input.attribution.utmMedium),
    utmCampaign: truncateForMetadata(input.attribution.utmCampaign),
    utmContent: truncateForMetadata(input.attribution.utmContent),
    utmTerm: truncateForMetadata(input.attribution.utmTerm),
    referrer: truncateForMetadata(input.attribution.referrer, 300),
  };

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer_email: input.buyerEmail,
    line_items: [{ price: stripePriceId, quantity: 1 }],
    success_url: `${base}/get-started/${input.planSlug}/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${base}/get-started/${input.planSlug}?cancelled=1`,
    metadata,
    subscription_data: { metadata },
  });
  if (!session.url) {
    throw new BillingError("Stripe did not return a checkout URL.", 502);
  }
  return { url: session.url };
}

// ---------------------------------------------------------------------------
// Stripe webhook handlers (called from lib/stripe/webhooks.ts routing)
// ---------------------------------------------------------------------------

/** checkout.session.completed with metadata.kind === "subAccountPlan". */
export async function handleSubAccountPlanCheckoutCompleted(
  session: Stripe.Checkout.Session,
): Promise<void> {
  const subAccountId = session.metadata?.subAccountId;
  const planId = session.metadata?.planId;
  if (!subAccountId || !planId) {
    console.error(
      "[billing] subAccountPlan checkout completed without subAccountId/planId metadata",
    );
    return;
  }

  const db = getAdminDb();
  const ref = db.doc(`subAccounts/${subAccountId}`);
  const snap = await ref.get();
  if (!snap.exists) {
    console.error(`[billing] checkout completed for missing sub-account ${subAccountId}`);
    return;
  }
  const data = snap.data() as Record<string, unknown>;
  const agencyId = String(data.agencyId ?? "");
  const billing = readBilling(data);

  await ref.update({
    "billing.status": "active" satisfies SubAccountBillingStatus,
    "billing.stripeCustomerId":
      (session.customer as string | null) ?? billing?.stripeCustomerId ?? null,
    "billing.stripeSubscriptionId":
      (session.subscription as string | null) ??
      billing?.stripeSubscriptionId ??
      null,
    "billing.checkoutTokenHash": null,
    "billing.graceUntil": null,
    "billing.activatedAt": FieldValue.serverTimestamp(),
    "billing.updatedAt": FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  // Apply the plan's gate bundle now that payment landed. Look the plan up
  // fresh so a gate edit between assignment and payment still applies.
  try {
    const planSnap = await db
      .doc(`agencies/${agencyId}/plans/${planId}`)
      .get();
    const gates = planSnap.exists
      ? normalizePlanGates(planSnap.data()?.gates)
      : null;
    if (gates) {
      const { skippedMetaGates } = await applyFeatureGates(subAccountId, gates);
      if (skippedMetaGates.length > 0) {
        console.warn(
          `[billing] plan ${planId} wants Meta gates but the deployment lacks META_APP_ID/SECRET — left off for ${subAccountId}`,
        );
      }
    }
  } catch (err) {
    // Activation must not fail because a gate write blipped — the agency
    // can re-apply from the Manage dialog.
    console.error("[billing] gate application on activation failed", err);
  }

  recordBillingEvent({
    agencyId,
    subAccountId,
    event: "activated",
    detail: {
      planId,
      planName: billing?.planName ?? null,
      priceCents: billing?.priceCents ?? null,
      stripeSubscriptionId: (session.subscription as string | null) ?? null,
    },
  });
  void emitWebhookEvent({
    subAccountId,
    agencyId,
    mode: "live",
    type: "billing.activated",
    payload: {
      subAccountId,
      planId,
      planName: billing?.planName ?? null,
      priceCents: billing?.priceCents ?? null,
      currency: billing?.currency ?? null,
    },
  });
}

/**
 * checkout.session.completed with metadata.kind === "platformSignup" — a
 * stranger just paid for a publicly-purchasable Agency Plan with no
 * pre-existing sub-account. Provisions the account end-to-end:
 *
 *   1. Idempotency checkpoint (`purchases/{session.id}`, doc.kind =
 *      "platformSignup") — the SAME collection + `.create()`-throws-on-
 *      duplicate pattern `handleFoundersCheckout` already uses one screen up
 *      in this file, extended with a resumable `subAccountId` checkpoint
 *      (see below) because this flow has more than one side effect to make
 *      idempotent, unlike a single Firestore write.
 *   2. Re-resolve the plan fresh from Firestore (never trust checkout-time
 *      metadata for anything Stripe-object-shaped) and look up the agency
 *      owner (every sub-account creation — manual or automatic — is
 *      attributed to the owner, matching `createSubAccountForAgency`'s
 *      existing contract).
 *   3. `createSubAccountForAgency` — the EXACT function
 *      `POST /api/agency/sub-accounts` (manual creation) and the AI Suite's
 *      `create_sub_account` capability already call. Produces a
 *      structurally identical SubAccountDoc, membership, seeded templates,
 *      AND — via its own `accountContact` invite step — the buyer's owner
 *      invite + delivery email through the SAME invite system Settings →
 *      Members uses. No second account-creation or invite path exists.
 *   4. Write `SubAccountDoc.billing` directly to "active" — the identical
 *      shape `handleSubAccountPlanCheckoutCompleted` above writes on a
 *      manually-billed client's first payment. Same collection, same
 *      fields, same `effectiveBillingState()`/`billingBlocksWorkspace()`
 *      that already read it. No new billing model.
 *   5. `applyFeatureGates` — the same plan-gates application
 *      `handleSubAccountPlanCheckoutCompleted` performs.
 *   6. Re-tag the Stripe subscription's metadata from `platformSignup` to
 *      `SUB_ACCOUNT_PLAN_KIND` + the now-known `subAccountId`. This is the
 *      hand-off: every subscription.updated/.deleted event from this point
 *      on is routed by `lib/stripe/webhooks.ts` to the pre-existing,
 *      UNCHANGED `handleSubAccountSubscriptionEvent` below — dunning,
 *      cancellation, and the Billing Portal all keep working exactly as
 *      they do for a manually-billed client, because as far as that sync
 *      logic is concerned, this IS a manually-billed client from here on.
 *   7. A dedicated payment-confirmation welcome email (separate from the
 *      invite email in step 3, which carries the actual sign-in link).
 *
 * IDEMPOTENCY: Stripe redelivers webhooks (retries + dashboard "Resend").
 * The `purchases/{session.id}` doc is the atomicity anchor. On the first
 * delivery, `.create()` succeeds and provisioning proceeds. On a genuine
 * duplicate delivery of an ALREADY-FULFILLED session, `.create()` throws
 * ALREADY_EXISTS and this function returns immediately without touching
 * anything else. The subtler case this guards against: a delivery that
 * previously got partway through and failed (network blip, a transient
 * Firestore/Stripe error) — `.create()` also throws ALREADY_EXISTS there,
 * but the stored doc's `status` is "processing"/"error", not "provisioned",
 * so the function RESUMES: if `subAccountId` is already checkpointed on the
 * doc, `createSubAccountForAgency` is NOT called again (which would create a
 * second sub-account) — the remaining steps (billing write, gates,
 * subscription re-tag, welcome email) just re-run against the SAME
 * sub-account, and are each individually idempotent (plain `.update()`s
 * with deterministic values, or an explicit `welcomeEmailSentAt` guard for
 * the one true side effect — the email — that isn't naturally idempotent).
 */
export async function handlePlatformSignupCheckoutCompleted(
  session: Stripe.Checkout.Session,
): Promise<void> {
  const db = getAdminDb();
  const meta = session.metadata ?? {};
  const agencyId = meta.agencyId;
  const planId = meta.planId;
  const interval: BillingInterval = meta.interval === "year" ? "year" : "month";
  // Prefer what Stripe itself collected/verified during checkout; fall back
  // to the metadata we stamped at session-creation time.
  const buyerEmail =
    session.customer_details?.email ?? session.customer_email ?? meta.buyerEmail;
  const businessName = meta.businessName || "";

  if (!agencyId || !planId || !buyerEmail) {
    console.error(
      `[billing] platformSignup checkout ${session.id} missing required metadata (agencyId/planId/buyerEmail) — cannot provision`,
    );
    return;
  }

  const purchaseRef = db.collection("purchases").doc(session.id);
  let subAccountId: string | null = null;

  const initialDoc = {
    sessionId: session.id,
    kind: PLATFORM_SIGNUP_KIND,
    agencyId,
    planId,
    interval,
    buyerEmail,
    businessName,
    stripeCustomerId: (session.customer as string | null) ?? null,
    stripeSubscriptionId: (session.subscription as string | null) ?? null,
    status: "processing" as "processing" | "provisioned" | "error",
    subAccountId: null as string | null,
    invite: null as unknown,
    welcomeEmailSentAt: null as unknown,
    error: null as string | null,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };

  try {
    await purchaseRef.create(initialDoc);
  } catch (err) {
    const code = (err as { code?: number })?.code;
    if (code !== 6) throw err; // not ALREADY_EXISTS — a real write failure.
    const existing = await purchaseRef.get();
    const existingData = existing.data() ?? {};
    if (existingData.status === "provisioned") {
      console.log(
        `[billing] platformSignup: skipping duplicate webhook for already-provisioned session ${session.id}`,
      );
      return;
    }
    // "processing" or "error" from a prior attempt — resume rather than
    // restart. If a sub-account was already checkpointed, reuse it instead
    // of calling createSubAccountForAgency again (which would duplicate it).
    subAccountId = (existingData.subAccountId as string | null) ?? null;
  }

  try {
    if (!subAccountId) {
      const [planSnap, agencySnap] = await Promise.all([
        db.doc(`agencies/${agencyId}/plans/${planId}`).get(),
        db.doc(`agencies/${agencyId}`).get(),
      ]);
      if (!planSnap.exists) {
        throw new Error(`Plan ${planId} not found under agency ${agencyId}`);
      }
      if (!agencySnap.exists) {
        throw new Error(`Agency ${agencyId} not found`);
      }
      const plan = { ...(planSnap.data() as BillingPlanDoc), id: planSnap.id };
      const ownerUid = agencySnap.data()?.ownerUid as string | undefined;
      if (!ownerUid) {
        throw new Error(`Agency ${agencyId} has no ownerUid`);
      }
      const ownerRecord = await getAdminAuth().getUser(ownerUid);

      const created = await createSubAccountForAgency({
        agencyId,
        uid: ownerUid,
        email: ownerRecord.email ?? "",
        displayName: ownerRecord.displayName ?? "",
        name: businessName || `${buyerEmail.split("@")[0]}'s workspace`,
        slug: "",
        timezone: "UTC",
        accountContact: { name: null, email: buyerEmail, phone: null },
      });
      subAccountId = created.subAccountId;

      await purchaseRef.update({
        subAccountId,
        invite: created.invite,
        updatedAt: FieldValue.serverTimestamp(),
      });

      // Billing write — identical shape to handleSubAccountPlanCheckoutCompleted's
      // activation write above, so effectiveBillingState()/billingBlocksWorkspace()
      // and every UI that reads SubAccountDoc.billing need no changes at all.
      const priceCents =
        interval === "year" ? plan.priceAnnualCents : plan.priceMonthlyCents;
      const stripePriceId =
        interval === "year" ? plan.stripeAnnualPriceId : plan.stripePriceId;
      await db.doc(`subAccounts/${subAccountId}`).update({
        billing: {
          status: "active" satisfies SubAccountBillingStatus,
          planId: plan.id,
          planName: plan.name,
          priceCents: priceCents ?? null,
          billingInterval: interval,
          currency: plan.currency,
          specialPriceCents: null,
          stripePriceId: stripePriceId ?? null,
          stripeCustomerId: (session.customer as string | null) ?? null,
          stripeSubscriptionId: (session.subscription as string | null) ?? null,
          checkoutTokenHash: null,
          graceUntil: null,
          assignedAt: FieldValue.serverTimestamp(),
          activatedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        },
        updatedAt: FieldValue.serverTimestamp(),
      });

      // Plan's feature-gate bundle — same chokepoint every other activation
      // path uses.
      try {
        const { skippedMetaGates } = await applyFeatureGates(subAccountId, plan.gates);
        if (skippedMetaGates.length > 0) {
          console.warn(
            `[billing] platformSignup plan ${planId} wants Meta gates but the deployment lacks META_APP_ID/SECRET — left off for ${subAccountId}`,
          );
        }
      } catch (err) {
        // Activation must not fail because a gate write blipped — the agency
        // can re-apply from the Manage dialog, same tolerance as the manual
        // activation path above.
        console.error("[billing] platformSignup gate application failed", err);
      }

      // Hand off to the EXISTING subscription sync path (see doc comment) —
      // every subsequent updated/deleted event now routes through
      // handleSubAccountSubscriptionEvent unmodified.
      if (session.subscription) {
        await getStripeServer().subscriptions.update(
          session.subscription as string,
          {
            metadata: {
              kind: SUB_ACCOUNT_PLAN_KIND,
              agencyId,
              subAccountId,
              planId: plan.id,
            },
          },
        );
      }

      recordBillingEvent({
        agencyId,
        subAccountId,
        event: "activated",
        detail: {
          planId: plan.id,
          planName: plan.name,
          priceCents: priceCents ?? null,
          via: "platformSignup",
          stripeSubscriptionId: (session.subscription as string | null) ?? null,
        },
      });
      void emitWebhookEvent({
        subAccountId,
        agencyId,
        mode: "live",
        type: "billing.activated",
        payload: {
          subAccountId,
          planId: plan.id,
          planName: plan.name,
          priceCents: priceCents ?? null,
          currency: plan.currency,
        },
      });
    }

    // Welcome email — separate from the invite email (which carries the
    // actual sign-in link) and guarded so a webhook retry after this point
    // never sends it twice.
    const currentSnap = await purchaseRef.get();
    if (!currentSnap.data()?.welcomeEmailSentAt) {
      try {
        if (emailIsConfigured() && subAccountId) {
          const [brandName, brand] = await Promise.all([
            resolveBrandName(),
            resolveCustomBrand(),
          ]);
          await sendEmail({
            to: buyerEmail,
            subject: `Your ${brandName} subscription is active`,
            text: renderPlatformSignupWelcomeText({
              brandName,
              buyerEmail,
              supportEmail: brand.supportEmail,
            }),
            html: renderPlatformSignupWelcomeHtml({
              brandName,
              buyerEmail,
              supportEmail: brand.supportEmail,
            }),
          });
        }
      } catch (err) {
        // Best-effort — the invite email (already sent inside
        // createSubAccountForAgency) still carries the actual login link,
        // so a failure here doesn't strand the buyer.
        console.error("[billing] platformSignup welcome email failed", err);
      }
      await purchaseRef.update({
        welcomeEmailSentAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }

    await purchaseRef.update({
      status: "provisioned",
      updatedAt: FieldValue.serverTimestamp(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error(
      `[billing] platformSignup provisioning failed for session ${session.id}: ${message}`,
    );
    await purchaseRef
      .update({
        status: "error",
        error: message,
        updatedAt: FieldValue.serverTimestamp(),
      })
      .catch(() => undefined);
    // Rethrow so the webhook route returns 500 and Stripe retries — the
    // retry resumes from the subAccountId checkpoint above rather than
    // duplicating anything.
    throw err;
  }
}

function renderPlatformSignupWelcomeText(ctx: {
  brandName: string;
  buyerEmail: string;
  supportEmail: string;
}): string {
  return [
    `Your ${ctx.brandName} subscription is active.`,
    ``,
    `Payment was received and your workspace is being set up now.`,
    ``,
    `A separate email is on its way to ${ctx.buyerEmail} with a link to create your login — that's where you'll set your password and get in. If it doesn't arrive in a few minutes, check spam.`,
    ``,
    `Once you're in, you'll log in at any time from the ${ctx.brandName} sign-in page.`,
    ``,
    `Questions? Contact us at ${ctx.supportEmail}.`,
  ].join("\n");
}

function renderPlatformSignupWelcomeHtml(ctx: {
  brandName: string;
  buyerEmail: string;
  supportEmail: string;
}): string {
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `
    <div style="font-family:-apple-system,sans-serif;font-size:14px;line-height:1.6;color:#18181b;max-width:480px;">
      <p style="font-size:16px;font-weight:600;margin:0 0 12px;">Your ${esc(ctx.brandName)} subscription is active</p>
      <p style="margin:0 0 12px;">Payment was received and your workspace is being set up now.</p>
      <p style="margin:0 0 12px;">A separate email is on its way to <strong>${esc(ctx.buyerEmail)}</strong> with a link to create your login — that's where you'll set your password and get in. If it doesn't arrive in a few minutes, check spam.</p>
      <p style="margin:0 0 12px;">Once you're in, you'll log in at any time from the ${esc(ctx.brandName)} sign-in page.</p>
      <p style="margin:20px 0 0;color:#52525b;">Questions? Contact us at <a href="mailto:${esc(ctx.supportEmail)}">${esc(ctx.supportEmail)}</a>.</p>
    </div>
  `.trim();
}

/**
 * customer.subscription.updated / .deleted with metadata.kind ===
 * "subAccountPlan". Maps Stripe's status to ours and stamps/clears the
 * dunning grace window.
 */
export async function handleSubAccountSubscriptionEvent(
  subscription: Stripe.Subscription,
  opts: { deleted: boolean },
): Promise<void> {
  const db = getAdminDb();

  // Fast path: metadata carries the sub-account id. Fallback: look the
  // subscription id up (covers subscriptions whose metadata was stripped
  // in the Stripe dashboard).
  let subAccountId: string | null =
    subscription.metadata?.subAccountId ?? null;
  if (!subAccountId) {
    const match = await db
      .collection("subAccounts")
      .where("billing.stripeSubscriptionId", "==", subscription.id)
      .limit(1)
      .get();
    subAccountId = match.empty ? null : match.docs[0].id;
  }
  if (!subAccountId) {
    console.error(
      `[billing] no sub-account found for subscription ${subscription.id}`,
    );
    return;
  }

  const ref = db.doc(`subAccounts/${subAccountId}`);
  const snap = await ref.get();
  if (!snap.exists) return;
  const data = snap.data() as Record<string, unknown>;
  const agencyId = String(data.agencyId ?? "");
  const billing = readBilling(data);
  if (!billing || billing.status === "comped") return;
  // Ignore events from a superseded subscription (e.g. the old sub's
  // cancellation arriving after a re-checkout already created a new one).
  if (
    billing.stripeSubscriptionId &&
    billing.stripeSubscriptionId !== subscription.id
  ) {
    return;
  }

  // While pending (client hasn't completed checkout), only a transition to
  // "active" is meaningful — half-finished checkout sessions emit
  // incomplete/incomplete_expired subscription noise that must not flip a
  // never-paid workspace into dunning or cancellation.
  if (
    billing.status === "pending" &&
    subscription.status !== "active" &&
    subscription.status !== "trialing"
  ) {
    return;
  }

  let nextStatus: SubAccountBillingStatus;
  if (opts.deleted) {
    nextStatus = "canceled";
  } else {
    switch (subscription.status) {
      case "active":
      case "trialing":
        nextStatus = "active";
        break;
      case "past_due":
      case "unpaid":
      case "incomplete":
        nextStatus = "past_due";
        break;
      case "canceled":
      case "incomplete_expired":
        nextStatus = "canceled";
        break;
      default:
        nextStatus = billing.status;
    }
  }

  const updates: Record<string, unknown> = {
    "billing.stripeSubscriptionId": opts.deleted ? null : subscription.id,
    "billing.updatedAt": FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };

  if (nextStatus !== billing.status) {
    updates["billing.status"] = nextStatus;
  }
  if (nextStatus === "past_due") {
    // Stamp the grace window ONCE per dunning episode — repeat past_due
    // events (Stripe retries) must not keep pushing the paywall out.
    const alreadyStamped = billing.status === "past_due" && billing.graceUntil;
    if (!alreadyStamped) {
      updates["billing.graceUntil"] = Timestamp.fromMillis(
        Date.now() + BILLING_GRACE_DAYS * 24 * 60 * 60 * 1000,
      );
    }
  }
  if (nextStatus === "active") {
    updates["billing.graceUntil"] = null;
  }

  await ref.update(updates);

  if (nextStatus !== billing.status) {
    recordBillingEvent({
      agencyId,
      subAccountId,
      event: "status.changed",
      detail: {
        previousStatus: billing.status,
        status: nextStatus,
        stripeStatus: subscription.status,
        deleted: opts.deleted,
      },
    });
    const eventType =
      nextStatus === "past_due"
        ? "billing.past_due"
        : nextStatus === "canceled"
          ? "billing.canceled"
          : nextStatus === "active"
            ? "billing.activated"
            : null;
    if (eventType) {
      void emitWebhookEvent({
        subAccountId,
        agencyId,
        mode: "live",
        type: eventType,
        payload: {
          subAccountId,
          planId: billing.planId,
          planName: billing.planName,
          previousStatus: billing.status,
          status: nextStatus,
        },
      });
    }
  }
}

// ---------------------------------------------------------------------------
// One-time charges (agency → sub-account client, e.g. "Web design — $500")
// ---------------------------------------------------------------------------

function chargesCollection() {
  return getAdminDb().collection("billingCharges");
}

function serializeCharge(
  id: string,
  data: FirebaseFirestore.DocumentData,
): BillingChargeResponse {
  return {
    id,
    subAccountId: String(data.subAccountId ?? ""),
    description: String(data.description ?? ""),
    amountCents: Number(data.amountCents ?? 0),
    currency: String(data.currency ?? "usd"),
    status:
      data.status === "paid" || data.status === "canceled"
        ? (data.status as BillingChargeStatus)
        : "pending",
    createdAt: tsToIso(data.createdAt),
    paidAt: tsToIso(data.paidAt),
  };
}

export function validateChargeInput(
  description: unknown,
  amountCents: unknown,
  currency: unknown,
): { description: string; amountCents: number; currency: string } {
  const desc = typeof description === "string" ? description.trim() : "";
  if (!desc || desc.length > 120) {
    throw new BillingError("description is required (1–120 characters).");
  }
  if (
    typeof amountCents !== "number" ||
    !Number.isInteger(amountCents) ||
    amountCents < MIN_PRICE_CENTS ||
    amountCents > MAX_PRICE_CENTS
  ) {
    throw new BillingError(
      `amountCents must be an integer between ${MIN_PRICE_CENTS} and ${MAX_PRICE_CENTS}.`,
    );
  }
  const cur = typeof currency === "string" ? currency.trim().toLowerCase() : "";
  if (!/^[a-z]{3}$/.test(cur)) {
    throw new BillingError(
      'currency must be a 3-letter ISO code (e.g. "usd", "aud").',
    );
  }
  return { description: desc, amountCents, currency: cur };
}

/**
 * Create a one-time charge and mint its /pay/charge link. Works for ANY
 * sub-account in the agency — including comped ones (a one-off "web design"
 * fee doesn't require a subscription).
 */
export async function createOneTimeCharge(input: {
  agencyId: string;
  subAccountId: string;
  createdByUid: string;
  description: string;
  amountCents: number;
  currency: string;
}): Promise<{ charge: BillingChargeResponse; checkoutUrl: string }> {
  if (!billingStripeIsConfigured()) {
    throw new BillingError(
      "Stripe isn't configured on this deployment. Set STRIPE_SECRET_KEY first.",
      503,
    );
  }
  // Re-anchor the target to the caller's agency (same discipline as plans).
  await getSubInAgencyOrThrow(input.agencyId, input.subAccountId);

  const ref = chargesCollection().doc();
  const { token, hash } = issueChargeToken(ref.id);
  const doc: Omit<BillingChargeDoc, "id" | "createdAt" | "paidAt" | "updatedAt"> = {
    agencyId: input.agencyId,
    subAccountId: input.subAccountId,
    description: input.description,
    amountCents: input.amountCents,
    currency: input.currency,
    status: "pending",
    tokenHash: hash,
    stripeCheckoutSessionId: null,
    stripePaymentIntentId: null,
    createdByUid: input.createdByUid,
  };
  await ref.set({
    ...doc,
    id: ref.id,
    createdAt: FieldValue.serverTimestamp(),
    paidAt: null,
    updatedAt: FieldValue.serverTimestamp(),
  });

  recordBillingEvent({
    agencyId: input.agencyId,
    subAccountId: input.subAccountId,
    event: "charge.created",
    detail: {
      chargeId: ref.id,
      description: input.description,
      amountCents: input.amountCents,
      currency: input.currency,
    },
  });

  const snap = await ref.get();
  return {
    charge: serializeCharge(ref.id, snap.data() ?? {}),
    checkoutUrl: buildChargeCheckoutUrl(token),
  };
}

export async function listChargesForSubAccount(
  agencyId: string,
  subAccountId: string,
): Promise<BillingChargeResponse[]> {
  await getSubInAgencyOrThrow(agencyId, subAccountId);
  const snap = await chargesCollection()
    .where("subAccountId", "==", subAccountId)
    .limit(100)
    .get();
  return snap.docs
    .filter((d) => d.data().agencyId === agencyId)
    .map((d) => serializeCharge(d.id, d.data()))
    .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
}

async function getChargeInAgencyOrThrow(
  agencyId: string,
  chargeId: string,
): Promise<{ ref: FirebaseFirestore.DocumentReference; data: BillingChargeDoc }> {
  const ref = chargesCollection().doc(chargeId);
  const snap = await ref.get();
  if (!snap.exists || snap.data()?.agencyId !== agencyId) {
    throw new BillingError("Charge not found", 404);
  }
  return { ref, data: { ...(snap.data() as BillingChargeDoc), id: snap.id } };
}

/** Rotate the charge's token and return a fresh /pay/charge URL. */
export async function mintChargeCheckoutLink(input: {
  agencyId: string;
  chargeId: string;
}): Promise<string> {
  const { ref, data } = await getChargeInAgencyOrThrow(
    input.agencyId,
    input.chargeId,
  );
  if (data.status !== "pending") {
    throw new BillingError(
      data.status === "paid"
        ? "This charge is already paid."
        : "This charge was canceled — create a new one instead.",
    );
  }
  const { token, hash } = issueChargeToken(input.chargeId);
  await ref.update({
    tokenHash: hash,
    updatedAt: FieldValue.serverTimestamp(),
  });
  return buildChargeCheckoutUrl(token);
}

/** Void a pending charge: kills the link; paid charges can't be canceled here. */
export async function cancelOneTimeCharge(input: {
  agencyId: string;
  chargeId: string;
}): Promise<void> {
  const { ref, data } = await getChargeInAgencyOrThrow(
    input.agencyId,
    input.chargeId,
  );
  if (data.status === "paid") {
    throw new BillingError(
      "This charge is already paid — refund it from the Stripe dashboard instead.",
    );
  }
  if (data.status === "canceled") return;
  await ref.update({
    status: "canceled" satisfies BillingChargeStatus,
    tokenHash: null,
    updatedAt: FieldValue.serverTimestamp(),
  });
  recordBillingEvent({
    agencyId: input.agencyId,
    subAccountId: data.subAccountId,
    event: "charge.canceled",
    detail: { chargeId: input.chargeId, description: data.description },
  });
}

/**
 * Start the Stripe Checkout for a verified /pay/charge token. mode:"payment"
 * with ad-hoc price_data — no Stripe Product/Price is created. Reuses the
 * sub-account's existing Stripe customer when one exists so the payment
 * lands on the same client record as their subscription.
 */
export async function createChargeCheckoutSession(input: {
  chargeId: string;
  successUrl: string;
  cancelUrl: string;
}): Promise<{ url: string }> {
  if (!billingStripeIsConfigured()) {
    throw new BillingError("Stripe isn't configured on this deployment.", 503);
  }
  const ref = chargesCollection().doc(input.chargeId);
  const snap = await ref.get();
  if (!snap.exists) throw new BillingError("Charge not found", 404);
  const charge = snap.data() as BillingChargeDoc;
  if (charge.status === "paid") {
    throw new BillingError("This charge is already paid — nothing more to do.");
  }
  if (charge.status === "canceled") {
    throw new BillingError(
      "This charge was canceled. Ask your provider for a new payment link.",
    );
  }

  const subSnap = await getAdminDb()
    .doc(`subAccounts/${charge.subAccountId}`)
    .get();
  const billing = subSnap.exists
    ? readBilling(subSnap.data() as Record<string, unknown>)
    : null;

  const stripe = getStripeServer();
  const metadata = {
    kind: SUB_ACCOUNT_CHARGE_KIND,
    agencyId: charge.agencyId,
    subAccountId: charge.subAccountId,
    chargeId: input.chargeId,
  };
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    ...(billing?.stripeCustomerId ? { customer: billing.stripeCustomerId } : {}),
    line_items: [
      {
        price_data: {
          currency: charge.currency,
          unit_amount: charge.amountCents,
          product_data: { name: charge.description },
        },
        quantity: 1,
      },
    ],
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    metadata,
    payment_intent_data: { metadata },
  });
  if (!session.url) {
    throw new BillingError("Stripe did not return a checkout URL.", 502);
  }
  await ref.update({
    stripeCheckoutSessionId: session.id,
    updatedAt: FieldValue.serverTimestamp(),
  });
  return { url: session.url };
}

/** checkout.session.completed with metadata.kind === "subAccountCharge". */
export async function handleSubAccountChargeCheckoutCompleted(
  session: Stripe.Checkout.Session,
): Promise<void> {
  const chargeId = session.metadata?.chargeId;
  if (!chargeId) {
    console.error(
      "[billing] subAccountCharge checkout completed without chargeId metadata",
    );
    return;
  }
  const ref = chargesCollection().doc(chargeId);
  const snap = await ref.get();
  if (!snap.exists) {
    console.error(`[billing] checkout completed for missing charge ${chargeId}`);
    return;
  }
  const charge = snap.data() as BillingChargeDoc;
  if (charge.status === "paid") return; // webhook retry — idempotent

  await ref.update({
    status: "paid" satisfies BillingChargeStatus,
    tokenHash: null,
    stripeCheckoutSessionId: session.id,
    stripePaymentIntentId:
      typeof session.payment_intent === "string" ? session.payment_intent : null,
    paidAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  recordBillingEvent({
    agencyId: charge.agencyId,
    subAccountId: charge.subAccountId,
    event: "charge.paid",
    detail: {
      chargeId,
      description: charge.description,
      amountCents: charge.amountCents,
      currency: charge.currency,
    },
  });
  void emitWebhookEvent({
    subAccountId: charge.subAccountId,
    agencyId: charge.agencyId,
    mode: "live",
    type: "billing.charge.paid",
    payload: {
      chargeId,
      subAccountId: charge.subAccountId,
      description: charge.description,
      amountCents: charge.amountCents,
      currency: charge.currency,
    },
  });
}
