import "server-only";

import { createHash } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import type { CheckoutOrder, Funnel, FunnelStep } from "@/types/checkout";
import type { FunnelAnalyticsDaily, FunnelAnalyticsEvent, FunnelAnalyticsEventType, FunnelAnalyticsMode } from "@/types/funnel-analytics";

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
  if (input.verified && input.amountCents && input.amountCents > 0) {
    const key = input.type === "checkout_completed" ? "initialPurchaseCents" : input.type === "offer_accepted" ? "offerPurchaseCents" : null;
    if (key) {
      updates[`modes.${mode}.revenue.${key}`] = FieldValue.increment(input.amountCents);
      if (input.stepId) updates[`modes.${mode}.byStep.${safe(input.stepId)}.revenue.${key}`] = FieldValue.increment(input.amountCents);
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
    if (uniqueRef) tx.create(uniqueRef, { day, mode, key: input.anonymousUniqueKey, createdAt: now });
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

export async function recordCheckoutAnalytics(input: { event: "checkout_started" | "checkout_completed" | "checkout_failed"; order?: CheckoutOrder; funnelId: string; stepId: string; idempotencyKey: string }): Promise<void> {
  const order = input.order;
  if (!order) return;
  await recordFunnelAnalyticsEventSafe({
    type: input.event, agencyId: order.agencyId, subAccountId: order.subAccountId, funnelId: input.funnelId, stepId: input.stepId,
    funnelSessionId: null, memberId: order.memberId, orderId: order.id, paymentMode: modeFor(order.paymentMode), stripeAccountId: order.stripeAccountId,
    verified: input.event === "checkout_completed", amountCents: input.event === "checkout_completed" ? order.totals.dueTodayCents : null,
    currency: order.currency, idempotencyKey: input.idempotencyKey, outcome: input.event === "checkout_failed" ? "failed" : input.event === "checkout_completed" ? "payment" : null,
  });
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

export async function publicFunnelStepForPage(pageId: string): Promise<{ funnel: Funnel; step: FunnelStep } | null> {
  const snaps = await getAdminDb().collectionGroup("steps").where("pageId", "==", pageId).limit(5).get();
  for (const snap of snaps.docs) {
    const step = { id: snap.id, ...(snap.data() as Omit<FunnelStep, "id">) };
    const funnelSnap = await getAdminDb().doc(`funnels/${step.funnelId}`).get();
    const funnel = funnelSnap.data() as Funnel | undefined;
    if (funnelSnap.exists && funnel?.status === "published" && funnel.subAccountId === step.subAccountId) return { funnel: { ...funnel, id: funnelSnap.id }, step };
  }
  return null;
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
