import "server-only";

import { createHash } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import type { CheckoutOrder, Funnel, FunnelStep } from "@/types/checkout";
import type { FunnelAnalyticsDaily, FunnelAnalyticsEvent, FunnelAnalyticsEventType, FunnelAnalyticsMode } from "@/types/funnel-analytics";
import { getStripeEnvironment, normalizePaymentMode } from "@/lib/stripe/server";
import { recordCheckoutPagePurchase } from "@/lib/server/page-analytics-service";

const eventsCol = () => getAdminDb().collection("funnelAnalyticsEvents");
const dailyCol = (funnelId: string) => getAdminDb().collection(`funnels/${funnelId}/analyticsDaily`);
const uniqueCol = (funnelId: string) => getAdminDb().collection(`funnels/${funnelId}/analyticsUnique`);
const safe = (value: string) => value.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 120);
const hash = (value: string) => createHash("sha256").update(value).digest("hex");

export function analyticsDay(at = Date.now()): string { return new Date(at).toISOString().slice(0, 10); }

function modeFor(value: CheckoutOrder["paymentMode"] | FunnelAnalyticsMode | null | undefined): FunnelAnalyticsMode {
  return value === "test" || value === "live" ? value : "unknown";
}
function eventId(type: FunnelAnalyticsEventType, key: string): string { return hash(`${type}:${key}`); }

type Common = {
  type: FunnelAnalyticsEventType;
  agencyId: string;
  subAccountId: string;
  funnelId: string;
  stepId?: string | null;
  pageId?: string | null;
  funnelSessionId?: string | null;
  anonymousSessionId?: string | null;
  memberId?: string | null;
  contactId?: string | null;
  orderId?: string | null;
  purchaseId?: string | null;
  offerId?: string | null;
  paymentMode?: FunnelAnalyticsMode | null;
  stripeAccountId?: string | null;
  verified?: boolean;
  outcome?: FunnelAnalyticsEvent["outcome"];
  route?: string | null;
  amountCents?: number | null;
  currency?: string | null;
  idempotencyKey: string;
  anonymousUniqueKey?: string | null;
};

function deltas(input: FunnelAnalyticsEvent, unique: boolean): Record<string, unknown> {
  const mode = safe(input.paymentMode);
  const type = safe(input.type);
  const updates: Record<string, unknown> = {
    [`modes.${mode}.events.${type}`]: FieldValue.increment(1),
  };
  if (unique) updates[`modes.${mode}.uniqueVisitors`] = FieldValue.increment(1);
  if (input.type === "funnel_entry" && unique) updates[`modes.${mode}.uniqueSessions`] = FieldValue.increment(1);
  if (input.stepId) {
    const step = safe(input.stepId);
    updates[`modes.${mode}.byStep.${step}.events.${type}`] = FieldValue.increment(1);
    if (unique) updates[`modes.${mode}.byStep.${step}.uniqueVisitors`] = FieldValue.increment(1);
  }
  // Outcome counters keep paid purchases, $0 free trials and free orders
  // apart (reports never count a trial as a purchase or as revenue).
  if (input.outcome && (input.type === "checkout_completed" || input.type === "offer_accepted")) {
    updates[`modes.${mode}.outcomes.${type}.${safe(input.outcome)}`] = FieldValue.increment(1);
    if (input.stepId) updates[`modes.${mode}.byStep.${safe(input.stepId)}.outcomes.${type}.${safe(input.outcome)}`] = FieldValue.increment(1);
  }
  if (input.verified && input.amountCents && input.amountCents > 0) {
    const key = input.type === "checkout_completed" ? "initialPurchaseCents" : input.type === "offer_accepted" ? "offerPurchaseCents" : null;
    if (key) {
      updates[`modes.${mode}.revenue.${key}`] = FieldValue.increment(input.amountCents);
      if (input.stepId) updates[`modes.${mode}.byStep.${safe(input.stepId)}.revenue.${key}`] = FieldValue.increment(input.amountCents);
      // Money is never summed across currencies in reports.
      const currency = safe((input.currency ?? "").toUpperCase());
      if (currency) {
        updates[`modes.${mode}.revenueByCurrency.${currency}`] = FieldValue.increment(input.amountCents);
        if (input.stepId) updates[`modes.${mode}.byStep.${safe(input.stepId)}.revenueByCurrency.${currency}`] = FieldValue.increment(input.amountCents);
      }
    }
  }
  return updates;
}
/** Writes the immutable event and its bounded daily rollup atomically. */
export async function recordFunnelAnalyticsEvent(input: Common): Promise<boolean> {
  const now = Date.now();
  const mode = modeFor(input.paymentMode);
  const event: FunnelAnalyticsEvent = {
    id: eventId(input.type, input.idempotencyKey), type: input.type,
    agencyId: input.agencyId, subAccountId: input.subAccountId, funnelId: input.funnelId,
    stepId: input.stepId ?? null, pageId: input.pageId ?? null, funnelSessionId: input.funnelSessionId ?? null,
    anonymousSessionId: input.anonymousSessionId ?? null, memberId: input.memberId ?? null, contactId: input.contactId ?? null,
    orderId: input.orderId ?? null, purchaseId: input.purchaseId ?? null, offerId: input.offerId ?? null,
    paymentMode: mode, stripeAccountId: input.stripeAccountId ?? null, verified: input.verified === true,
    outcome: input.outcome ?? null, route: input.route ?? null, amountCents: input.amountCents ?? null,
    currency: input.currency ?? null, occurredAt: now, createdAt: now,
  };
  const eventRef = eventsCol().doc(event.id);
  const day = analyticsDay(now);
  const dailyRef = dailyCol(event.funnelId).doc(day);
  const uniqueKey = input.anonymousUniqueKey ? hash(`${day}:${mode}:${input.anonymousUniqueKey}`) : null;
  const uniqueRef = uniqueKey ? uniqueCol(event.funnelId).doc(uniqueKey) : null;
  return getAdminDb().runTransaction(async (tx) => {
    if ((await tx.get(eventRef)).exists) return false;
    const unique = uniqueRef ? !(await tx.get(uniqueRef)).exists : false;
    tx.create(eventRef, event);
    tx.set(dailyRef, { funnelId: event.funnelId, agencyId: event.agencyId, subAccountId: event.subAccountId, day, updatedAt: now }, { merge: true });
    tx.update(dailyRef, { updatedAt: now, ...deltas(event, unique) });
    // Only a NEW visitor creates the marker. (Creating it unconditionally made
    // every repeat view by the same visitor fail with ALREADY_EXISTS, so
    // refreshes and second step views were silently dropped.)
    if (uniqueRef && unique) tx.create(uniqueRef, { day, mode, key: input.anonymousUniqueKey, createdAt: now });
    return true;
  });
}

export async function recordFunnelAnalyticsEventSafe(input: Common): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try { await recordFunnelAnalyticsEvent(input); return; } catch (err) {
      if (attempt === 2) console.error(`[funnel-analytics] ${input.type} write failed`, err);
      else await new Promise((resolve) => setTimeout(resolve, 25 * (attempt + 1)));
    }
  }
}

/** What a verified checkout actually was: money collected, a $0 free trial, or a $0 free order. */
export function checkoutCompletionOutcome(order: Pick<CheckoutOrder, "totals">): "payment" | "trial_activation" | "free" {
  if (order.totals.dueTodayCents > 0) return "payment";
  if (order.totals.recurring && order.totals.recurring.trialDays > 0) return "trial_activation";
  return "free";
}

export async function recordCheckoutAnalytics(input: { event: "checkout_started" | "checkout_completed" | "checkout_failed"; order?: CheckoutOrder; funnelId: string; stepId: string; idempotencyKey: string }): Promise<void> {
  const order = input.order;
  if (!order) return;
  const outcome = input.event === "checkout_failed" ? "failed" : input.event === "checkout_completed" ? checkoutCompletionOutcome(order) : null;
  await recordFunnelAnalyticsEventSafe({
    type: input.event, agencyId: order.agencyId, subAccountId: order.subAccountId, funnelId: input.funnelId, stepId: input.stepId,
    funnelSessionId: null, memberId: order.memberId, orderId: order.id, paymentMode: modeFor(order.paymentMode), stripeAccountId: order.stripeAccountId,
    verified: input.event === "checkout_completed", amountCents: input.event === "checkout_completed" ? order.totals.dueTodayCents : null,
    currency: order.currency, idempotencyKey: input.idempotencyKey, outcome,
  });
  // A verified paid purchase is also the conversion of the page that hosts
  // this checkout (when that page really contains the checkout block).
  if (input.event === "checkout_completed" && outcome === "payment") {
    await recordCheckoutPagePurchase({ order, funnelId: input.funnelId, stepId: input.stepId }).catch((err) =>
      console.error("[page-analytics] purchase goal write failed", err instanceof Error ? err.message : err),
    );
  }
}

/** The payment mode a checkout runs in — the same rule the checkout engine uses (the primary Offer's mode, else the deployment's). */
export async function offerPaymentModeFor(subAccountId: string, offerId: string | null | undefined): Promise<FunnelAnalyticsMode> {
  if (!offerId) return "unknown";
  try {
    const offer = await getAdminDb().doc(`subAccounts/${subAccountId}/courseOffers/${offerId}`).get();
    if (!offer.exists) return "unknown";
    return normalizePaymentMode(offer.get("paymentMode"), getStripeEnvironment());
  } catch {
    return "unknown";
  }
}

export async function getFunnelAnalyticsDaily(input: { subAccountId: string; funnelId: string; from: string; to: string }): Promise<FunnelAnalyticsDaily[]> {
  const funnel = await getAdminDb().doc(`funnels/${input.funnelId}`).get();
  if (!funnel.exists || funnel.get("subAccountId") !== input.subAccountId) throw new Error("Funnel not found");
  const start = new Date(`${input.from}T00:00:00.000Z`); const end = new Date(`${input.to}T00:00:00.000Z`);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || start > end) throw new Error("Invalid analytics date range");
  const days = Math.floor((end.getTime() - start.getTime()) / 86_400_000) + 1;
  if (days > 366) throw new Error("Analytics range is limited to 366 days");
  const refs = Array.from({ length: days }, (_, i) => dailyCol(input.funnelId).doc(analyticsDay(start.getTime() + i * 86_400_000)));
  const snaps = await getAdminDb().getAll(...refs);
  return snaps.filter((s) => s.exists && s.get("subAccountId") === input.subAccountId).map((s) => s.data() as FunnelAnalyticsDaily);
}

/** Short per-instance cache: a busy page's beacons don't repeat the lookup. */
const pageStepCache = new Map<string, { at: number; value: { funnel: Funnel; step: FunnelStep } | null }>();
const PAGE_STEP_CACHE_MS = 60_000;

/**
 * The published funnel step that shows this page, or null. Uses only
 * single-collection queries (the workspace's funnels, then each published
 * funnel's own steps) — the same pattern as the Pages library. (A
 * collection-group query on `steps` needs an index production doesn't have.)
 */
export async function publicFunnelStepForPage(pageId: string): Promise<{ funnel: Funnel; step: FunnelStep } | null> {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(pageId)) return null;
  const cached = pageStepCache.get(pageId);
  if (cached && Date.now() - cached.at < PAGE_STEP_CACHE_MS) return cached.value;
  const db = getAdminDb();
  const page = await db.doc(`pages/${pageId}`).get();
  const subAccountId = page.get("subAccountId");
  let value: { funnel: Funnel; step: FunnelStep } | null = null;
  if (page.exists && page.get("status") === "published" && typeof subAccountId === "string" && subAccountId) {
    const funnels = await db.collection("funnels").where("subAccountId", "==", subAccountId).get();
    for (const f of funnels.docs) {
      const funnel = f.data() as Funnel;
      if (funnel.status !== "published") continue;
      const steps = await db.collection(`funnels/${f.id}/steps`).where("pageId", "==", pageId).limit(1).get();
      const snap = steps.docs[0];
      if (!snap) continue;
      const step = { id: snap.id, ...(snap.data() as Omit<FunnelStep, "id">) };
      if (step.subAccountId !== subAccountId) continue;
      value = { funnel: { ...funnel, id: f.id }, step };
      break;
    }
  }
  if (pageStepCache.size > 2000) pageStepCache.clear();
  pageStepCache.set(pageId, { at: Date.now(), value });
  return value;
}

export async function publicFunnelStepForCheckoutConfig(configId: string): Promise<{ funnel: Funnel; step: FunnelStep } | null> {
  const snap = await getAdminDb().doc(`checkoutConfigs/${configId}`).get();
  const context = snap.data()?.context as { type?: string; funnelId?: string; stepId?: string } | undefined;
  if (!snap.exists || context?.type !== "funnel_step" || !context.funnelId || !context.stepId) return null;
  const funnelSnap = await getAdminDb().doc(`funnels/${context.funnelId}`).get();
  const stepSnap = await getAdminDb().doc(`funnels/${context.funnelId}/steps/${context.stepId}`).get();
  const funnel = funnelSnap.data() as Funnel | undefined;
  if (!funnelSnap.exists || !stepSnap.exists || funnel?.status !== "published") return null;
  const step = { id: stepSnap.id, ...(stepSnap.data() as Omit<FunnelStep, "id">) };
  if (funnel.subAccountId !== step.subAccountId) return null;
  return { funnel: { ...funnel, id: funnelSnap.id }, step };
}
