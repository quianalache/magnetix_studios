import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { getAdminDb } from "@/lib/firebase/admin";
import { funnelPostPurchaseChargingEnabled } from "@/lib/checkout/capabilities";
import { normalizeRouting, hasRouting } from "@/lib/checkout/funnel-routing";
import { normalizeStepOffer, outcomeActionKey, outcomeEffects, runnableAction, stepOfferProblem } from "@/lib/checkout/funnel-offer";
import { formatMoney, type FunnelOfferActionResponse, type FunnelOfferRuntimeView } from "@/lib/checkout/funnel-runtime-view";
import { getCourseOffer } from "@/lib/server/course-offer-service";
import { applyContactTags } from "@/lib/server/contact-tags/tag-writer";
import { linkMemberContactServerSide } from "@/lib/community/member-account";
import { startWorkflowForCheckoutEvent } from "@/lib/workflows/engine";
import type { CheckoutOrder, FunnelSession, FunnelSessionStepRecord, FunnelStep, StepOfferSettings } from "@/types/checkout";
import type { CourseOffer } from "@/types/course-offers";
import { CheckoutError } from "./common";
import { getCheckoutConfigDoc } from "./config-service";
import { recordFunnelAnalyticsEventSafe } from "@/lib/server/funnel-analytics-service";
import { offerFacts } from "./funnel-offer-service";
import {
  chargeFunnelOfferOrder,
  closeFunnelOfferAttempt,
  completeOrder,
  createFunnelOfferOrder,
  funnelEndDestination,
  funnelOfferPaymentTarget,
  publishableKeyFor,
  savedPaymentMethodForOrder,
} from "./order-service";

/**
 * Post-purchase funnel runtime (Pages & Funnels): the buyer's path through
 * Upsell / Downsell steps after a PAID funnel Checkout.
 *
 * Session — `funnelSessions/fs_{checkoutOrderId}` (server-only, default-deny
 * rules), opened only by the paid Checkout order itself; the browser holds a
 * signed httpOnly cookie (`mx_fs_{funnelId}`) naming it. A direct visit,
 * someone else's cookie, another workspace, an expired or completed session
 * can't act. Only the session's CURRENT step can be accepted / declined.
 *
 * Outcomes (owner decisions): Accept actions run only after a Stripe-VERIFIED
 * payment (`completeOrder`); Decline only after the buyer declines; a failed /
 * pending / authentication-required payment keeps the buyer on the step. One
 * order per session + step (`fo_{session}_{step}`), so clicks, refreshes,
 * retries and webhooks can't charge twice; outcome effects carry a once-per-
 * outcome key and are retried until done.
 */

const SESSION_IDLE_MS = 2 * 60 * 60 * 1000;
const SESSION_MAX_MS = 24 * 60 * 60 * 1000;
const PROCESSING_CLAIM_MS = 30_000;
const sessionsCol = () => getAdminDb().collection("funnelSessions");
const stepsCol = (funnelId: string) => getAdminDb().collection(`funnels/${funnelId}/steps`);

export const funnelSessionCookieName = (funnelId: string) => `mx_fs_${funnelId}`;
export const FUNNEL_SESSION_COOKIE_PREFIX = "mx_fs_";
export const funnelOfferOrderId = (sessionId: string, stepId: string) => `fo_${sessionId}_${stepId}`.slice(0, 64);

function secret(): string {
  const s = process.env.AUTOMATIONS_TOKEN_SECRET;
  if (!s) throw new Error("AUTOMATIONS_TOKEN_SECRET is not set — required to sign funnel sessions.");
  return s;
}
function sign(sessionId: string): string {
  return createHmac("sha256", secret()).update(`funnel-session:v1:${sessionId}`).digest("base64url");
}
export function issueFunnelSessionToken(sessionId: string): string {
  return `fs1.${sessionId}.${sign(sessionId)}`;
}
export function verifyFunnelSessionToken(token: unknown): string | null {
  if (typeof token !== "string") return null;
  const m = /^fs1\.(fs_[A-Za-z0-9_-]{1,61})\.([A-Za-z0-9_-]{20,})$/.exec(token);
  if (!m) return null;
  try {
    const a = Buffer.from(m[2]);
    const b = Buffer.from(sign(m[1]));
    return a.length === b.length && timingSafeEqual(a, b) ? m[1] : null;
  } catch {
    return null;
  }
}

async function listSteps(funnelId: string): Promise<FunnelStep[]> {
  const snap = await stepsCol(funnelId).get();
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<FunnelStep, "id">) })).sort((a, b) => a.order - b.order || a.createdAt - b.createdAt);
}

/* -------------------------------- Sessions -------------------------------- */

/**
 * Open (or reuse) the post-purchase session for a PAID funnel Checkout order
 * whose next destination is in the funnel. Returns the cookie to set, or
 * null (charging not enabled, not a funnel order, not paid, no next step).
 */
export async function openFunnelSessionForOrder(orderId: string): Promise<{ cookieName: string; token: string; maxAgeSeconds: number } | null> {
  const db = getAdminDb();
  const snap = await db.collection("checkoutOrders").doc(orderId).get();
  if (!snap.exists) return null;
  const order = { id: snap.id, ...(snap.data() as Omit<CheckoutOrder, "id">) };
  if (!funnelPostPurchaseChargingEnabled({ subAccountId: order.subAccountId, paymentMode: order.paymentMode })) return null;
  if (order.context.type !== "funnel_step" || order.status !== "paid" || order.items.some((i) => i.fulfillment !== "granted")) return null;
  const { funnelId, stepId } = order.context;
  const config = await getCheckoutConfigDoc(order.configId);
  const dest = config?.postPurchase;
  if (!dest || (dest.type !== "funnel_next_step" && dest.type !== "funnel_step")) return null;
  const steps = await listSteps(funnelId);
  const here = steps.findIndex((s) => s.id === stepId);
  const target = dest.type === "funnel_step" ? steps.find((s) => s.id === dest.stepId) : steps[here + 1];
  if (!target) return null;

  const sessionId = `fs_${order.id}`;
  const ref = sessionsCol().doc(sessionId);
  const existing = await ref.get();
  if (!existing.exists) {
    const now = Date.now();
    const session: FunnelSession = {
      id: sessionId,
      agencyId: order.agencyId,
      subAccountId: order.subAccountId,
      funnelId,
      checkoutOrderId: order.id,
      checkoutStepId: stepId,
      memberId: order.memberId,
      paymentMode: order.paymentMode,
      stripeAccountId: order.stripeAccountId,
      stripeCustomerId: order.stripeCustomerId,
      paymentMethodId: await savedPaymentMethodForOrder(order),
      currentStepId: target.id,
      path: [stepId, target.id],
      steps: {},
      status: hasRouting(target.type) ? "active" : "completed",
      createdAt: now,
      updatedAt: now,
      expiresAt: now + SESSION_IDLE_MS,
    };
    await ref.create(session).catch(() => undefined); // a concurrent status call created it
  }
  return { cookieName: funnelSessionCookieName(funnelId), token: issueFunnelSessionToken(sessionId), maxAgeSeconds: SESSION_MAX_MS / 1000 };
}

type SessionCheck = { ok: true; session: FunnelSession } | { ok: false; status: number; code: string; message: string };

async function loadSession(funnelId: string, token: unknown, opts: { readOnly?: boolean } = {}): Promise<SessionCheck> {
  const sessionId = verifyFunnelSessionToken(token);
  if (!sessionId) return { ok: false, status: 401, code: "no_session", message: "This offer is only available right after checkout." };
  const snap = await sessionsCol().doc(sessionId).get();
  if (!snap.exists) return { ok: false, status: 401, code: "no_session", message: "This offer is only available right after checkout." };
  const session = { id: snap.id, ...(snap.data() as Omit<FunnelSession, "id">) };
  if (session.funnelId !== funnelId) return { ok: false, status: 403, code: "wrong_funnel", message: "This offer is only available right after checkout." };
  if (session.status === "active" && session.expiresAt <= Date.now()) {
    if (!opts.readOnly) await snap.ref.update({ status: "expired", updatedAt: Date.now() }).catch(() => undefined);
    session.status = "expired";
  }
  return { ok: true, session };
}

/* --------------------------- Runtime validation --------------------------- */

type StepCheck =
  | { ok: true; step: FunnelStep; settings: StepOfferSettings; offer: CourseOffer; publishableKey: string | null }
  | { ok: false; customer: string; creator: string };

/** Everything a purchase on this step needs, re-checked on the server every time (never a client badge). */
async function validateOfferStep(session: FunnelSession, stepId: string): Promise<StepCheck> {
  const unavailable = (creator: string): StepCheck => ({ ok: false, customer: "This offer isn't available right now.", creator });
  const db = getAdminDb();
  const funnel = (await db.doc(`funnels/${session.funnelId}`).get()).data();
  if (!funnel || funnel.subAccountId !== session.subAccountId || funnel.status !== "published") return unavailable("funnel_not_published");
  const stepSnap = await stepsCol(session.funnelId).doc(stepId).get();
  if (!stepSnap.exists) return unavailable("step_missing");
  const step = { id: stepSnap.id, ...(stepSnap.data() as Omit<FunnelStep, "id">) };
  if (step.subAccountId !== session.subAccountId || !hasRouting(step.type)) return unavailable("not_an_offer_step");
  if (!step.pageId) return unavailable("no_page");
  const page = (await db.doc(`pages/${step.pageId}`).get()).data();
  if (!page || page.subAccountId !== session.subAccountId || page.status !== "published") return unavailable("page_unpublished");
  const settings = normalizeStepOffer(step.offer);
  if (!settings.offerId) return unavailable("no_offer");
  const offer = await getCourseOffer(session.subAccountId, settings.offerId);
  if (!offer || offer.subAccountId !== session.subAccountId) return unavailable("offer_missing");
  const problem = stepOfferProblem(offerFacts(offer), session.subAccountId);
  if (problem) return unavailable(`offer_ineligible: ${problem}`);
  // Free-trial subscriptions are supported (owner decision 2026-11-13); every
  // subscription still needs its disclosure confirmed in Step Settings.
  if (offer.type === "recurring" && !settings.payment.recurringDisclosureAcknowledged) return unavailable("subscription_disclosure_not_confirmed");
  try {
    const target = await funnelOfferPaymentTarget(session.subAccountId, offer);
    if (target.accountId !== session.stripeAccountId || target.paymentMode !== session.paymentMode) return unavailable("stripe_account_mismatch");
    if (!target.publishableKey) return unavailable("payments_not_configured");
    return { ok: true, step, settings, offer, publishableKey: target.publishableKey };
  } catch {
    return unavailable("payments_not_ready");
  }
}

/* -------------------------------- Routing -------------------------------- */

async function routeAfter(session: FunnelSession, stepId: string, side: "accept" | "decline"): Promise<{ nextStepId: string | null; nextHref: string; offerStep: boolean }> {
  const steps = await listSteps(session.funnelId);
  const i = steps.findIndex((s) => s.id === stepId);
  const route = normalizeRouting(i >= 0 ? steps[i].routing : null)[side];
  const next = route.type === "funnel_step" ? steps.find((s) => s.id === route.stepId) ?? null : i >= 0 ? steps[i + 1] ?? null : null;
  if (!next) return { nextStepId: null, nextHref: await funnelEndDestination(session.subAccountId, session.memberId), offerStep: false };
  let href: string | null = null;
  if (next.pageId) href = `/p/${next.pageId}`;
  else if (next.type === "checkout" && next.checkoutConfigId) href = `/checkout/${next.checkoutConfigId}`;
  return { nextStepId: next.id, nextHref: href ?? (await funnelEndDestination(session.subAccountId, session.memberId)), offerStep: hasRouting(next.type) };
}

/* -------------------------------- Outcomes -------------------------------- */

const blankRecord = (): FunnelSessionStepRecord => ({ state: "processing", orderId: null, consentAt: null, failure: null, effects: null, effectsKey: null, nextStepId: null, nextHref: null, updatedAt: Date.now() });

/**
 * Record a FINAL outcome for a step once (verified purchase or intentional
 * decline), advance the session along the step's saved route, then run the
 * step's CRM actions once. Safe to call repeatedly (webhook, browser, retry).
 */
async function recordOutcome(sessionId: string, stepId: string, outcome: "succeeded" | "declined", orderId: string | null, acceptance: "payment" | "trial_activation" | null = null): Promise<void> {
  const db = getAdminDb();
  const ref = sessionsCol().doc(sessionId);
  const first = await ref.get();
  if (!first.exists) return;
  const session = { id: first.id, ...(first.data() as Omit<FunnelSession, "id">) };
  const route = await routeAfter(session, stepId, outcome === "succeeded" ? "accept" : "decline");
  // A verified trial activation and a verified payment are different outcomes
  // (and different once-only keys); neither is a "declined".
  const key = outcomeActionKey({ sessionId, stepId, outcome: outcome === "declined" ? "declined" : acceptance === "trial_activation" ? "trial_activated" : "payment_succeeded", paymentRef: orderId });
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const s = snap.data() as Omit<FunnelSession, "id">;
    const rec = s.steps?.[stepId] ?? blankRecord();
    if (rec.state === outcome && rec.effectsKey) return; // already recorded
    // A verified payment always wins: the buyer was charged, so they get the purchase.
    if (rec.state === "succeeded" && outcome === "declined") return;
    const next: FunnelSessionStepRecord = { ...rec, state: outcome, acceptance: outcome === "succeeded" ? acceptance ?? "payment" : null, orderId: orderId ?? rec.orderId, failure: null, effects: "pending", effectsKey: key, nextStepId: route.nextStepId, nextHref: route.nextHref, updatedAt: Date.now() };
    const advancing = s.currentStepId === stepId;
    tx.update(ref, {
      [`steps.${stepId}`]: next,
      ...(advancing
        ? { currentStepId: route.nextStepId, path: [...(s.path ?? []), ...(route.nextStepId ? [route.nextStepId] : [])], status: route.offerStep ? s.status : "completed" }
        : {}),
      effectsPending: true,
      updatedAt: Date.now(),
      expiresAt: Math.min(s.createdAt + SESSION_MAX_MS, Date.now() + SESSION_IDLE_MS),
    });
  });
  const accepted = outcome === "succeeded";
  const offerOrder = orderId ? (await db.doc(`checkoutOrders/${orderId}`).get()).data() as CheckoutOrder | undefined : undefined;
  await recordFunnelAnalyticsEventSafe({
    type: accepted ? "offer_accepted" : "offer_declined", agencyId: session.agencyId, subAccountId: session.subAccountId,
    funnelId: session.funnelId, stepId, funnelSessionId: session.id, memberId: session.memberId, orderId,
    offerId: (await stepsCol(session.funnelId).doc(stepId).get()).get("offer.offerId") ?? null,
    paymentMode: session.paymentMode, stripeAccountId: session.stripeAccountId, verified: accepted,
    outcome: accepted ? acceptance ?? "payment" : "declined", amountCents: accepted ? offerOrder?.totals.dueTodayCents ?? null : null,
    currency: accepted ? offerOrder?.currency ?? null : null, idempotencyKey: `funnel-outcome:${session.id}:${stepId}:${key}`,
  });
  if (route.nextStepId) {
    await recordFunnelAnalyticsEventSafe({
      type: "step_transition", agencyId: session.agencyId, subAccountId: session.subAccountId, funnelId: session.funnelId,
      stepId, funnelSessionId: session.id, memberId: session.memberId, paymentMode: session.paymentMode, verified: accepted,
      route: accepted ? "accept" : "decline", idempotencyKey: `funnel-transition:${session.id}:${stepId}:${route.nextStepId}:${outcome}`,
    });
  } else {
    await recordFunnelAnalyticsEventSafe({
      type: "funnel_completed", agencyId: session.agencyId, subAccountId: session.subAccountId, funnelId: session.funnelId,
      stepId, funnelSessionId: session.id, memberId: session.memberId, paymentMode: session.paymentMode, verified: accepted,
      idempotencyKey: `funnel-completed:${session.id}`,
    });
  }
  await runPendingEffects(sessionId, stepId);
}

/** Run a step's outcome CRM actions if still pending; mark done only after they're handled. */
async function runPendingEffects(sessionId: string, stepId: string): Promise<void> {
  const ref = sessionsCol().doc(sessionId);
  const snap = await ref.get();
  if (!snap.exists) return;
  const session = { id: snap.id, ...(snap.data() as Omit<FunnelSession, "id">) };
  const rec = session.steps?.[stepId];
  if (!rec || rec.effects !== "pending" || !rec.effectsKey || (rec.state !== "succeeded" && rec.state !== "declined")) return;
  const step = (await stepsCol(session.funnelId).doc(stepId).get()).data() as Omit<FunnelStep, "id"> | undefined;
  const settings = normalizeStepOffer(step?.offer);
  const trial = rec.state === "succeeded" && rec.acceptance === "trial_activation";
  const effects = outcomeEffects(rec.state === "succeeded" ? (trial ? "trial_activated" : "payment_succeeded") : "declined", settings);
  try {
    if (effects.crm) {
      const action = runnableAction(effects.crm.action);
      const member = (await getAdminDb().doc(`subAccounts/${session.subAccountId}/members/${session.memberId}`).get()).data();
      const contactId = (member?.contactId as string | undefined) || (await linkMemberContactServerSide(session.subAccountId, session.memberId));
      if (contactId) {
        if (action.addTags.length || action.removeTags.length) {
          await applyContactTags({ subAccountId: session.subAccountId, contactId, add: action.addTags, remove: action.removeTags, ctx: { source: "funnel_offer", sourceId: rec.orderId ?? sessionId } });
        }
        if (action.workflowId) {
          const result = await startWorkflowForCheckoutEvent({
            workflowId: action.workflowId,
            subAccountId: session.subAccountId,
            contactId,
            context: {
              deduplicationKey: rec.effectsKey,
              eventId: rec.effectsKey,
              eventType: rec.state !== "succeeded" ? "funnel.offer.declined" : trial ? "funnel.offer.trial_started" : "funnel.offer.purchased",
              acceptance: rec.state === "succeeded" ? (trial ? "trial_activation" : "payment") : null,
              // This marker is created only after the server has verified the
              // TEST-mode, allow-listed funnel session. Workflow execution
              // stays observable, while external delivery nodes are skipped.
              sandbox: true,
              funnelId: session.funnelId,
              funnelStepId: stepId,
              ...(rec.orderId ? { orderId: rec.orderId } : {}),
              ...(settings.offerId ? { offerId: settings.offerId } : {}),
            },
          });
          // "failed" = the engine hit an error → leave pending for a retry.
          if (result === "failed") throw new Error("workflow start failed");
        }
      }
    }
    await getAdminDb().runTransaction(async (tx) => {
      const cur = (await tx.get(ref)).data() as Omit<FunnelSession, "id">;
      const others = Object.entries(cur.steps ?? {}).some(([id, r]) => id !== stepId && r.effects === "pending");
      tx.update(ref, { [`steps.${stepId}.effects`]: "done", effectsPending: others, updatedAt: Date.now() });
    });
  } catch (err) {
    console.error(`[funnel-runtime] outcome effects failed session=${sessionId} step=${stepId}`, err);
  }
}

/** Called by `completeOrder` once a funnel_offer order is Stripe-verified and granted. */
export async function finalizeFunnelOfferFromOrder(order: CheckoutOrder): Promise<void> {
  if (order.context.type !== "funnel_offer" || order.status !== "paid") return;
  await recordOutcome(order.context.sessionId, order.context.stepId, "succeeded", order.id, order.acceptance ?? "payment");
}

/* ------------------------------ Page runtime ------------------------------ */

function offerView(offer: CourseOffer): NonNullable<FunnelOfferRuntimeView["offer"]> {
  const agreement = offer.checkoutSettings?.serviceAgreement;
  const terms = agreement && agreement.mode !== "notRequired" ? agreement : null;
  const trialDays = offer.type === "recurring" ? Math.max(0, offer.trialDays ?? 0) : 0;
  return {
    title: offer.title,
    billing: offer.type === "recurring" ? "recurring" : "one_time",
    amountLabel: formatMoney(offer.priceCents ?? 0, offer.currency ?? "USD"),
    interval: offer.type === "recurring" ? offer.recurringInterval ?? null : null,
    termsText: terms?.customText?.trim() ? terms.customText.trim().slice(0, 1200) : null,
    termsUrl: terms?.linkUrl && /^https?:\/\//.test(terms.linkUrl) ? terms.linkUrl : null,
    trialDays,
    // Stripe starts billing when the trial ends: today + the Offer's trial days.
    firstChargeDate: trialDays > 0 ? new Date(Date.now() + trialDays * 86_400_000).toISOString() : null,
  };
}

/**
 * The Accept / Decline runtime for a published page, from the buyer's
 * session cookies. Null when this visitor has no session that reaches this
 * page (buttons stay inactive: no one-click by direct URL).
 */
export async function funnelOfferViewForPage(
  page: { id: string; subAccountId: string },
  cookies: Array<{ name: string; value: string }>,
): Promise<FunnelOfferRuntimeView | null> {
  for (const c of cookies.filter((x) => x.name.startsWith(FUNNEL_SESSION_COOKIE_PREFIX)).slice(0, 5)) {
    const funnelId = c.name.slice(FUNNEL_SESSION_COOKIE_PREFIX.length);
    // Page rendering is read-only (the public page route never writes).
    const check = await loadSession(funnelId, c.value, { readOnly: true });
    if (!check.ok || check.session.subAccountId !== page.subAccountId) continue;
    const session = check.session;
    if (!funnelPostPurchaseChargingEnabled({ subAccountId: session.subAccountId, paymentMode: session.paymentMode })) continue;
    const steps = await listSteps(funnelId);
    const step = steps.find((s) => s.pageId === page.id && hasRouting(s.type));
    if (!step) continue;
    const rec = session.steps?.[step.id] ?? null;
    const base = { funnelId, stepId: step.id, hasSavedPaymentMethod: !!session.paymentMethodId, failure: rec?.failure ?? null, nextHref: rec?.nextHref ?? null };
    // Already decided (refresh after purchase / decline): show where to go next.
    if (rec && (rec.state === "succeeded" || rec.state === "declined")) {
      return { ...base, available: false, unavailableMessage: null, state: rec.state, offer: null, stripe: null };
    }
    if (session.status !== "active" || session.currentStepId !== step.id) {
      return { ...base, available: false, unavailableMessage: "This offer is no longer available.", state: "ready", offer: null, stripe: null };
    }
    const v = await validateOfferStep(session, step.id);
    if (!v.ok) {
      console.warn(`[funnel-runtime] step unavailable funnel=${funnelId} step=${step.id} reason=${v.creator}`);
      return { ...base, available: false, unavailableMessage: v.customer, state: "ready", offer: null, stripe: null };
    }
    return {
      ...base,
      available: true,
      unavailableMessage: null,
      state: rec?.state ?? "ready",
      offer: offerView(v.offer),
      stripe: v.publishableKey ? { publishableKey: v.publishableKey, stripeAccount: session.stripeAccountId } : null,
    };
  }
  return null;
}

/* -------------------------------- Actions -------------------------------- */

export type FunnelOfferAction = "accept" | "decline" | "status";

async function saveRecord(sessionId: string, stepId: string, patch: Partial<FunnelSessionStepRecord>): Promise<void> {
  const ref = sessionsCol().doc(sessionId);
  await getAdminDb().runTransaction(async (tx) => {
    const s = (await tx.get(ref)).data() as Omit<FunnelSession, "id">;
    const rec = s.steps?.[stepId] ?? blankRecord();
    if (rec.state === "succeeded" || rec.state === "declined") return; // final outcomes never regress
    tx.update(ref, { [`steps.${stepId}`]: { ...rec, ...patch, updatedAt: Date.now() }, updatedAt: Date.now(), expiresAt: Math.min(s.createdAt + SESSION_MAX_MS, Date.now() + SESSION_IDLE_MS) });
  });
}

async function readRecord(sessionId: string, stepId: string): Promise<FunnelSessionStepRecord | null> {
  const s = (await sessionsCol().doc(sessionId).get()).data() as Omit<FunnelSession, "id"> | undefined;
  return s?.steps?.[stepId] ?? null;
}

function finalResponse(rec: FunnelSessionStepRecord): FunnelOfferActionResponse {
  return { state: rec.state, nextHref: rec.nextHref, failure: null, acceptance: rec.state === "succeeded" ? rec.acceptance ?? "payment" : null };
}

/**
 * The one entry point for Accept / Decline / status. The browser sends only
 * the funnel + step ids and (recurring) the consent tick — never an Offer id,
 * price or amount.
 */
export async function funnelOfferAction(input: { funnelId: string; stepId: string; action: FunnelOfferAction; token: unknown; consent?: unknown }): Promise<FunnelOfferActionResponse> {
  const check = await loadSession(input.funnelId, input.token);
  if (!check.ok) throw new CheckoutError(check.message, check.status, null, check.code);
  const session = check.session;
  if (!funnelPostPurchaseChargingEnabled({ subAccountId: session.subAccountId, paymentMode: session.paymentMode })) {
    throw new CheckoutError("This offer isn't available right now.", 403, null, "not_enabled");
  }
  const stepId = input.stepId;
  let rec: FunnelSessionStepRecord | null = session.steps?.[stepId] ?? null;

  if (rec?.effects === "pending") await runPendingEffects(session.id, stepId);
  if (rec && (rec.state === "succeeded" || rec.state === "declined")) return finalResponse((await readRecord(session.id, stepId)) ?? rec);
  // An expired / completed session can never start or re-try a purchase. The
  // one exception: a `status` check may still finish reconciling an attempt
  // that was ALREADY in flight for this step (e.g. a confirmed payment or a
  // completed bank verification), so expiry never strands a real purchase.
  if (session.status !== "active") {
    if (input.action === "status" && rec?.orderId && (rec.state === "processing" || rec.state === "requires_action" || rec.state === "payment_failed")) {
      const r = await chargeFunnelOfferOrder(rec.orderId, null).catch(() => null);
      if (r?.state === "succeeded") {
        const done = await readRecord(session.id, stepId);
        if (done && done.state === "succeeded") return finalResponse(done);
      }
    }
    throw new CheckoutError("This offer is no longer available.", 410, null, session.status === "expired" ? "expired" : "completed");
  }
  if (session.currentStepId !== stepId) throw new CheckoutError("This offer is no longer available.", 409, null, "not_current_step");

  // Reconcile an existing attempt against Stripe before anything else (a
  // network timeout isn't a failure; a crash after Stripe succeeded mustn't charge again).
  const reconcile = async (): Promise<FunnelOfferActionResponse | null> => {
    if (!rec?.orderId) return null;
    // A claim whose order was never written (crash in between) is re-claimed after PROCESSING_CLAIM_MS.
    const r = await chargeFunnelOfferOrder(rec.orderId, session.paymentMethodId).catch((err) => {
      if (err instanceof CheckoutError && err.status === 404) return null;
      throw err;
    });
    if (!r) return null;
    if (r.state === "succeeded") {
      await completeOrder(rec.orderId, { source: "client" });
      const done = await readRecord(session.id, stepId);
      return done && done.state === "succeeded" ? finalResponse(done) : { state: "processing" };
    }
    await saveRecord(session.id, stepId, { state: r.state, failure: r.failure });
    return { state: r.state, clientSecret: r.clientSecret, intentType: r.intentType, failure: r.failure };
  };

  if (input.action === "status") {
    return (await reconcile()) ?? { state: "ready" };
  }

  if (input.action === "decline") {
    if (rec?.orderId) {
      const closed = await closeFunnelOfferAttempt(rec.orderId);
      if (closed === "paid") {
        const done = await readRecord(session.id, stepId);
        if (done?.state === "succeeded") return finalResponse(done);
        // Verified paid but not yet recorded (e.g. webhook racing): record it now.
        await completeOrder(rec.orderId, { source: "client" });
        const again = await readRecord(session.id, stepId);
        return again ? finalResponse(again) : { state: "processing" };
      }
    }
    await recordOutcome(session.id, stepId, "declined", null);
    const done = await readRecord(session.id, stepId);
    return done ? finalResponse(done) : { state: "declined" };
  }

  // ---- accept ----
  const v = await validateOfferStep(session, stepId);
  if (!v.ok) {
    console.warn(`[funnel-runtime] accept refused funnel=${session.funnelId} step=${stepId} reason=${v.creator}`);
    throw new CheckoutError(v.customer, 409, null, "unavailable");
  }
  const recurring = v.offer.type === "recurring";
  if (recurring && input.consent !== true && !rec?.consentAt) {
    throw new CheckoutError("Please confirm the recurring charge to continue.", 400, { consent: "required" }, "consent_required");
  }

  if (rec?.orderId) {
    // An attempt exists: never start another. Failed → the inline form pays the SAME attempt.
    return (await reconcile()) ?? { state: "processing" };
  }

  // Claim the step (one in-flight accept per session + step).
  const ref = sessionsCol().doc(session.id);
  const orderId = funnelOfferOrderId(session.id, stepId);
  const claimed = await getAdminDb().runTransaction(async (tx) => {
    const s = (await tx.get(ref)).data() as Omit<FunnelSession, "id">;
    const cur = s.steps?.[stepId] ?? null;
    if (cur && cur.orderId && !(cur.state === "processing" && Date.now() - cur.updatedAt > PROCESSING_CLAIM_MS)) return false;
    tx.update(ref, { [`steps.${stepId}`]: { ...blankRecord(), orderId, consentAt: recurring ? Date.now() : null }, updatedAt: Date.now() });
    return true;
  });
  rec = await readRecord(session.id, stepId);
  if (!claimed) return (await reconcile()) ?? { state: "processing" };

  await createFunnelOfferOrder({ orderId, session, stepId, offer: v.offer, consentAt: rec?.consentAt ?? null });
  const r = await chargeFunnelOfferOrder(orderId, session.paymentMethodId);
  if (r.state === "succeeded") {
    const done = await readRecord(session.id, stepId);
    return done && done.state === "succeeded" ? finalResponse(done) : { state: "processing" };
  }
  await saveRecord(session.id, stepId, { state: r.state, failure: r.failure });
  return { state: r.state, clientSecret: r.clientSecret, intentType: r.intentType, failure: r.failure };
}

/** For the public page payload: the browser key for a session's payment mode. */
export function funnelPublishableKey(mode: "test" | "live" | null): string | null {
  return mode ? publishableKeyFor(mode) : null;
}

/**
 * Hourly backstop (task-rollover cron): outcome actions that didn't finish
 * (e.g. a crash after the purchase was verified) are retried — once-only
 * keys make repeats harmless. Equality-only query, no index.
 */
export async function retryPendingFunnelEffects(limit = 100): Promise<{ checked: number }> {
  const snap = await sessionsCol().where("effectsPending", "==", true).limit(limit).get();
  for (const d of snap.docs) {
    const steps = (d.data().steps ?? {}) as Record<string, FunnelSessionStepRecord>;
    for (const [stepId, r] of Object.entries(steps)) if (r.effects === "pending") await runPendingEffects(d.id, stepId);
  }
  return { checked: snap.size };
}
