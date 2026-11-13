import "server-only";

import { hasTag } from "@/lib/contacts/tag-names";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { publishCallback } from "@/lib/automations/qstash";
import { createContactServerSide, findExistingContactId, updateContactServerSide } from "@/lib/server/contacts-service";
import { applyContactTags } from "@/lib/server/contact-tags/tag-writer";
import { recordContactActivity } from "@/lib/server/contact-activity";
import { exitAbandonedCheckoutRuns, fireWorkflowTrigger, startWorkflowForCheckoutEvent } from "@/lib/workflows/engine";
import { abandonmentDecision, abandonDueAt, EMAIL_RE, normalizeCrm } from "@/lib/checkout/crm";
import type { ContactAttribution } from "@/types/contacts";
import type { CheckoutConfig, CheckoutCrmSettings, CheckoutOrder, CheckoutSession } from "@/types/checkout";
import type { WorkflowTriggerType } from "@/types/workflows";
import { recordFunnelAnalyticsEventSafe } from "@/lib/server/funnel-analytics-service";

/**
 * Checkout CRM & Follow-Up (Checkout Foundation Phase 3).
 *
 *   upsertCheckoutSession()   deliberate checkout start → session + Contact
 *                             (+ tags, consent, `checkout.started`, timer)
 *   runAbandonmentStep()      timer/sweep → `checkout.abandoned` (once)
 *   completeCheckoutCrm()     paid order → tags, session completed,
 *                             abandoned follow-up stopped, `checkout.completed`
 *   resumeCheckoutSession()   signed link → prefill for a fresh, re-quoted checkout
 *
 * Reuses the existing systems only: Contacts (contacts-service), tags (the
 * Contact's own `tags`), marketing consent (`Contact.emailConsent`, written
 * exactly like a form's consent checkbox), Workflows (the engine's trigger
 * dispatch + a guarded direct start), QStash for the timer. Every write is
 * best-effort around the purchase — a CRM problem never blocks a payment.
 */

const sessionsCol = () => getAdminDb().collection("checkoutSessions");
const ABANDON_STEP_PATH = "/api/order-checkout/abandonment/step";
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

/* ------------------------------ Resume tokens ----------------------------- */

const RESUME_DOMAIN = "checkout-resume-v1";

function secret(): string | null {
  const s = process.env.AUTOMATIONS_TOKEN_SECRET;
  return s && s.length >= 16 ? s : null;
}

export const hashResumeToken = (token: string) => createHash("sha256").update(token).digest("hex");

/**
 * `${sessionId}.${nonce}.${HMAC(domain:sessionId.nonce)}` — the quote-token
 * model with a domain prefix (a quote or billing token can never verify
 * here). Only the SHA-256 is stored; issuing a new one revokes the old.
 * Carries NO price, Offer or coupon data.
 */
export function issueResumeToken(sessionId: string): { token: string; hash: string } | null {
  const key = secret();
  if (!key || !ID_RE.test(sessionId)) return null;
  const nonce = randomBytes(16).toString("hex");
  const payload = `${sessionId}.${nonce}`;
  const sig = createHmac("sha256", key).update(`${RESUME_DOMAIN}:${payload}`).digest("hex");
  const token = `${payload}.${sig}`;
  return { token, hash: hashResumeToken(token) };
}

export function verifyResumeToken(token: unknown): { sessionId: string; hash: string } | null {
  const key = secret();
  if (!key || typeof token !== "string" || token.length > 300) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [sessionId, nonce, sig] = parts;
  if (!ID_RE.test(sessionId) || !/^[a-f0-9]{32}$/.test(nonce) || !/^[a-f0-9]{64}$/.test(sig)) return null;
  const expected = createHmac("sha256", key).update(`${RESUME_DOMAIN}:${sessionId}.${nonce}`).digest("hex");
  const a = Buffer.from(sig, "hex");
  const b = Buffer.from(expected, "hex");
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return { sessionId, hash: hashResumeToken(token) };
}

/* --------------------------------- URLs ---------------------------------- */

/** Where a buyer finishes this checkout: its Page (if the step has one) or the hosted page. */
export async function publicCheckoutPath(config: Pick<CheckoutConfig, "id" | "subAccountId" | "context">): Promise<string> {
  if (config.context.type === "hosted_offer") return `/offer/${config.subAccountId}/${config.context.offerId}/checkout`;
  const step = (await getAdminDb().doc(`funnels/${config.context.funnelId}/steps/${config.context.stepId}`).get()).data();
  const pageId = step?.pageId as string | undefined;
  if (pageId) {
    const page = (await getAdminDb().doc(`pages/${pageId}`).get()).data();
    if (page?.subAccountId === config.subAccountId && page?.status === "published") return `/p/${pageId}`;
  }
  return `/checkout/${config.id}`;
}

function absolute(path: string): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");
  return `${base}${path}`;
}

/* -------------------------------- Contacts -------------------------------- */

/**
 * Create or reuse THE Contact for this buyer (email-first, the shared
 * reconcile). An existing Contact only gets BLANK fields filled and a
 * first-touch attribution — never renamed by someone who knows its email.
 */
export async function reconcileCheckoutContact(input: {
  subAccountId: string;
  agencyId: string;
  email: string;
  name: string;
  phone: string;
  attribution: ContactAttribution | null;
}): Promise<{ contactId: string; created: boolean }> {
  const db = getAdminDb();
  const existingId = await findExistingContactId(db, input.subAccountId, { email: input.email });
  if (existingId) {
    const data = (await db.doc(`contacts/${existingId}`).get()).data() ?? {};
    const patch: Record<string, unknown> = {};
    if (input.name && !data.name) patch.name = input.name;
    if (input.phone && !data.phone) patch.phone = input.phone;
    if (input.attribution && !data.attribution) patch.attribution = input.attribution;
    if (Object.keys(patch).length) await updateContactServerSide({ contactId: existingId, patch });
    return { contactId: existingId, created: false };
  }
  const created = await createContactServerSide({
    subAccountId: input.subAccountId,
    agencyId: input.agencyId,
    createdByUid: "checkout",
    mode: "live",
    name: input.name || input.email.split("@")[0],
    email: input.email,
    phone: input.phone,
    company: "",
    address: "",
    // UTM source wins (same rule as public forms), otherwise "checkout".
    source: input.attribution?.utmSource || "checkout",
    tags: [],
    attribution: input.attribution,
  });
  return { contactId: created.id, created: true };
}

/**
 * Add / remove tags on a Contact through the shared tag service (Contacts
 * & Tags, 2026-11): registry spelling, Tag Added / Removed events and
 * Contact Activity only for real changes. A tag in both lists is removed
 * (checkout's existing rule — e.g. completed tags never re-add abandoned).
 */
async function changeTags(contactId: string, add: string[], remove: string[] = []): Promise<void> {
  if (!add.length && !remove.length) return;
  const snap = await getAdminDb().doc(`contacts/${contactId}`).get();
  if (!snap.exists) return;
  const subAccountId = String(snap.get("subAccountId") ?? "");
  if (!subAccountId) return;
  const keepAdded = add.filter((t) => !hasTag(remove, t));
  await applyContactTags({
    subAccountId,
    contactId,
    add: keepAdded,
    remove,
    ctx: { source: "checkout" },
  });
}

/**
 * Record EXPLICIT marketing consent (the buyer ticked the opt-in box) on the
 * Contact's existing `emailConsent`, the same shape a form's consent box
 * writes. Never called for a purchase on its own. Leaves an already-
 * consented Contact as is (no churn of the original consent record).
 */
async function recordMarketingConsent(input: { contactId: string; label: string; configId: string; sourceUrl: string | null }): Promise<void> {
  const ref = getAdminDb().doc(`contacts/${input.contactId}`);
  const data = (await ref.get()).data();
  if (!data || data.emailConsent?.status === "consented") return;
  await ref.update({
    emailOptedOut: false,
    emailConsent: {
      status: "consented",
      consentedAt: FieldValue.serverTimestamp(),
      unsubscribedAt: null,
      source: `checkout:${input.configId}`,
      sourceUrl: input.sourceUrl,
      textShown: input.label,
      ip: null,
    },
    updatedAt: FieldValue.serverTimestamp(),
  });
}

/* --------------------------------- Events --------------------------------- */

interface EventInput {
  type: Extract<WorkflowTriggerType, "checkout.started" | "checkout.abandoned" | "checkout.completed">;
  config: CheckoutConfig;
  contactId: string;
  dedupeKey: string;
  session: Pick<CheckoutSession, "id" | "offerId"> | null;
  offerTitle: string;
  extra?: Record<string, unknown>;
  workflowId?: string | null;
}

/**
 * Emit a checkout event into the existing Workflow engine (every active
 * Workflow on that trigger, narrowed by its optional Offer filter) and, when
 * the checkout picked one, start that Workflow directly — the shared dedupe
 * key stops a Workflow that is both picked AND listening from running twice.
 */
async function emitCheckoutEvent(input: EventInput): Promise<void> {
  const context = {
    eventId: input.dedupeKey,
    eventType: input.type,
    occurredAt: new Date().toISOString(),
    source: "checkout",
    deduplicationKey: input.dedupeKey,
    checkoutConfigId: input.config.id,
    checkoutSessionId: input.session?.id ?? null,
    offerId: input.session?.offerId ?? input.config.primaryOfferId,
    offerTitle: input.offerTitle,
    funnelId: input.config.context.type === "funnel_step" ? input.config.context.funnelId : null,
    ...(input.extra ?? {}),
  };
  await fireWorkflowTrigger({ subAccountId: input.config.subAccountId, agencyId: input.config.agencyId, type: input.type, contactId: input.contactId, context });
  if (input.workflowId) {
    await startWorkflowForCheckoutEvent({ workflowId: input.workflowId, subAccountId: input.config.subAccountId, contactId: input.contactId, context });
  }
}

async function offerTitleFor(subAccountId: string, offerId: string | null): Promise<string> {
  if (!offerId) return "";
  const data = (await getAdminDb().doc(`subAccounts/${subAccountId}/courseOffers/${offerId}`).get()).data();
  return ((data?.title as string) ?? "").slice(0, 200);
}

/* ------------------------------ Abandon timer ----------------------------- */

async function scheduleAbandonCheck(sessionId: string, dueAt: number): Promise<{ messageId: string | null }> {
  const res = await publishCallback({
    pathname: ABANDON_STEP_PATH,
    body: { sessionId },
    delaySeconds: Math.max(0, Math.ceil((dueAt - Date.now()) / 1000)),
    deduplicationId: `checkout_abandon_${sessionId}_${dueAt}`,
  });
  return { messageId: res?.messageId ?? null };
}

/* -------------------------------- Sessions -------------------------------- */

export interface SessionInput {
  config: CheckoutConfig;
  offerId: string;
  email: string;
  name: string;
  phone: string;
  /** The buyer's own session id from this browser, when it has one. */
  sessionId?: unknown;
  marketingOptIn: boolean;
  bumpIds: string[];
  couponCode: string | null;
  sourceUrl: string | null;
  attribution: ContactAttribution | null;
}

export interface SessionResult {
  sessionId: string | null;
  contactId: string | null;
}

function toSession(id: string, data: FirebaseFirestore.DocumentData): CheckoutSession {
  return { id, ...(data as Omit<CheckoutSession, "id">) };
}

async function findOpenSession(configId: string, email: string): Promise<CheckoutSession | null> {
  const snap = await sessionsCol().where("configId", "==", configId).where("email", "==", email).get();
  const open = snap.docs
    .map((d) => toSession(d.id, d.data()))
    .filter((s) => s.status === "started" || s.status === "abandoned")
    .sort((a, b) => b.lastActivityAt - a.lastActivityAt);
  return open[0] ?? null;
}

/**
 * A deliberate checkout start (two-step Continue, one-step valid email, or
 * the payment submit). Idempotent per buyer + checkout: the same browser
 * session — or the same email on the same checkout while still open — is
 * updated, never duplicated. Returns no session when contact capture is off.
 */
export async function upsertCheckoutSession(input: SessionInput): Promise<SessionResult> {
  const crm = normalizeCrm(input.config.crm);
  const email = input.email.trim().toLowerCase();
  if (!crm.captureContactOnStart || !EMAIL_RE.test(email)) return { sessionId: null, contactId: null };
  const now = Date.now();
  const config = input.config;

  // This browser's own session. A changed email supersedes it (a typo must
  // never be followed up), it is never reused for someone else's email.
  let session: CheckoutSession | null = null;
  if (typeof input.sessionId === "string" && ID_RE.test(input.sessionId)) {
    const snap = await sessionsCol().doc(input.sessionId).get();
    const prior = snap.exists ? toSession(snap.id, snap.data()!) : null;
    if (prior && prior.configId === config.id) {
      if (prior.email === email && (prior.status === "started" || prior.status === "abandoned")) session = prior;
      else if (prior.email !== email && prior.status === "started") {
        await snap.ref.update({ status: "superseded", abandonDueAt: null, updatedAt: now });
      }
    }
  }
  session ??= await findOpenSession(config.id, email);

  const { contactId } = await reconcileCheckoutContact({
    subAccountId: config.subAccountId,
    agencyId: config.agencyId,
    email,
    name: input.name,
    phone: input.phone,
    attribution: input.attribution,
  });

  if (input.marketingOptIn && crm.marketingOptIn.enabled) {
    await recordMarketingConsent({ contactId, label: crm.marketingOptIn.label, configId: config.id, sourceUrl: input.sourceUrl }).catch((err) =>
      console.error("[checkout-crm] consent write failed", err),
    );
    await changeTags(contactId, crm.marketingOptIn.tags).catch((err) => console.error("[checkout-crm] opt-in tags failed", err));
  }

  const dueAt = crm.abandoned.enabled ? abandonDueAt(now, crm.abandoned.delayMinutes) : null;
  const isNew = !session;
  const ref = session ? sessionsCol().doc(session.id) : sessionsCol().doc();
  const base = {
    name: input.name.slice(0, 120),
    phone: input.phone.slice(0, 40),
    contactId,
    marketingOptIn: (session?.marketingOptIn ?? false) || (input.marketingOptIn && crm.marketingOptIn.enabled),
    bumpIds: input.bumpIds.slice(0, 10),
    couponCode: input.couponCode ? input.couponCode.slice(0, 40) : null,
    lastActivityAt: now,
    // A session already followed up once is never followed up again.
    abandonDueAt: session?.abandonment?.firedAt ? null : dueAt,
    updatedAt: now,
  };
  if (isNew) {
    const doc: Omit<CheckoutSession, "id"> = {
      agencyId: config.agencyId,
      subAccountId: config.subAccountId,
      configId: config.id,
      context: config.context,
      offerId: input.offerId,
      format: config.format,
      email,
      status: "started",
      sourceUrl: input.sourceUrl,
      orderId: null,
      startedAt: now,
      completedAt: null,
      abandonedAt: null,
      abandonment: { scheduledFor: null, messageId: null, firedAt: null },
      resumeTokenHash: null,
      supersededBy: null,
      createdAt: now,
      ...base,
    };
    await ref.set(doc);
  } else {
    // A buyer who returns after being followed up is "in checkout" again.
    await ref.update({ ...base, status: "started" });
  }

  if (base.abandonDueAt) {
    const { messageId } = await scheduleAbandonCheck(ref.id, base.abandonDueAt);
    await ref.update({ "abandonment.scheduledFor": base.abandonDueAt, "abandonment.messageId": messageId }).catch(() => undefined);
  }

  if (isNew) {
    await changeTags(contactId, crm.startedTags).catch((err) => console.error("[checkout-crm] started tags failed", err));
    const offerTitle = await offerTitleFor(config.subAccountId, input.offerId);
    await recordContactActivity({
      subAccountId: config.subAccountId,
      contactId,
      type: "checkout_started",
      content: `Started checkout${offerTitle ? ` for ${offerTitle}` : ""}.`,
      createdBy: "checkout",
      dedupeKey: `checkout_started_${ref.id}`,
    });
    await emitCheckoutEvent({
      type: "checkout.started",
      config,
      contactId,
      dedupeKey: `checkout-started:${ref.id}`,
      session: { id: ref.id, offerId: input.offerId },
      offerTitle,
    });
    if (config.context.type === "funnel_step") {
      await recordFunnelAnalyticsEventSafe({
        type: "checkout_started", agencyId: config.agencyId, subAccountId: config.subAccountId,
        funnelId: config.context.funnelId, stepId: config.context.stepId, contactId,
        anonymousSessionId: null, paymentMode: null, verified: false,
        idempotencyKey: `checkout-session:${ref.id}`,
      });
    }
  }
  return { sessionId: ref.id, contactId };
}

/** Link an order to its session (called once the order exists). */
export async function linkOrderToSession(sessionId: string | null, orderId: string): Promise<void> {
  if (!sessionId) return;
  await sessionsCol().doc(sessionId).update({ orderId, updatedAt: Date.now() }).catch(() => undefined);
}

/* ------------------------------- Abandonment ------------------------------ */

export type AbandonStepOutcome = "fired" | "waiting" | "skipped" | "missing";

/**
 * Evaluate one session. Called by the QStash timer and the hourly sweep —
 * both safe to repeat: the abandoned flip is a transaction on
 * `abandonment.firedAt`, so the event, tags and Workflow happen at most once
 * per session no matter how many timers arrive.
 */
export async function runAbandonmentStep(sessionId: string): Promise<AbandonStepOutcome> {
  if (!ID_RE.test(sessionId)) return "missing";
  const ref = sessionsCol().doc(sessionId);
  const snap = await ref.get();
  if (!snap.exists) return "missing";
  const session = toSession(snap.id, snap.data()!);
  const configSnap = await getAdminDb().doc(`checkoutConfigs/${session.configId}`).get();
  const crm = normalizeCrm(configSnap.data()?.crm);
  const decision = abandonmentDecision(session, crm, Date.now());

  if (decision.action === "skip") {
    if (session.abandonDueAt) await ref.update({ abandonDueAt: null, updatedAt: Date.now() });
    return "skipped";
  }
  if (decision.action === "wait") {
    // The buyer was active again after this timer was set — the newer
    // activity already scheduled its own timer; only re-arm if missing.
    if (session.abandonment?.scheduledFor !== decision.dueAt) {
      const { messageId } = await scheduleAbandonCheck(sessionId, decision.dueAt);
      await ref.update({ abandonDueAt: decision.dueAt, "abandonment.scheduledFor": decision.dueAt, "abandonment.messageId": messageId });
    }
    return "waiting";
  }

  const issued = issueResumeToken(sessionId);
  const fired = await getAdminDb().runTransaction(async (tx) => {
    const fresh = await tx.get(ref);
    const s = fresh.data() as Omit<CheckoutSession, "id"> | undefined;
    if (!s || s.status !== "started" || s.abandonment?.firedAt) return false;
    const now = Date.now();
    tx.update(ref, {
      status: "abandoned",
      abandonedAt: now,
      abandonDueAt: null,
      "abandonment.firedAt": now,
      resumeTokenHash: issued?.hash ?? null,
      updatedAt: now,
    });
    return true;
  });
  if (!fired) return "skipped";

  const config = configSnap.exists ? ({ id: configSnap.id, ...(configSnap.data() as Omit<CheckoutConfig, "id">), crm } as CheckoutConfig) : null;
  if (!config || !session.contactId) return "fired";
  const offerTitle = await offerTitleFor(session.subAccountId, session.offerId);
  const resumeUrl = issued ? absolute(`${await publicCheckoutPath(config)}?resume=${encodeURIComponent(issued.token)}`) : "";
  await changeTags(session.contactId, crm.abandoned.tags).catch((err) => console.error("[checkout-crm] abandoned tags failed", err));
  await recordContactActivity({
    subAccountId: session.subAccountId,
    contactId: session.contactId,
    type: "checkout_abandoned",
    content: `Left checkout${offerTitle ? ` for ${offerTitle}` : ""} without completing it.`,
    createdBy: "checkout",
    dedupeKey: `checkout_abandoned_${sessionId}`,
  });
  await emitCheckoutEvent({
    type: "checkout.abandoned",
    config,
    contactId: session.contactId,
    dedupeKey: `checkout-abandoned:${sessionId}`,
    session,
    offerTitle,
    extra: { checkoutResumeUrl: resumeUrl, abandonedAfterMinutes: crm.abandoned.delayMinutes },
    workflowId: crm.abandoned.workflowId,
  });
  return "fired";
}

/**
 * Hourly backstop for timers QStash never delivered. Single-field range on
 * `abandonDueAt` (no composite index); settled sessions clear the field.
 */
export async function sweepAbandonedCheckouts(limit = 200): Promise<{ checked: number; fired: number }> {
  const snap = await sessionsCol().where("abandonDueAt", "<=", Date.now()).limit(limit).get();
  let fired = 0;
  for (const d of snap.docs) {
    const outcome = await runAbandonmentStep(d.id).catch((err) => {
      console.error("[checkout-crm] sweep step failed", d.id, err);
      return "skipped" as const;
    });
    if (outcome === "fired") fired++;
  }
  return { checked: snap.size, fired };
}

/* -------------------------------- Completion ------------------------------ */

/**
 * Paid order → CRM. Runs at most once per order (`crmCompletedAt`). Marks
 * the order's session and any other open session for the same buyer on the
 * same checkout as completed (so none can be followed up later), stops
 * Workflows started by their abandonment, applies purchase tags and emits
 * `checkout.completed`.
 */
export async function completeCheckoutCrm(order: CheckoutOrder): Promise<void> {
  const orderRef = getAdminDb().collection("checkoutOrders").doc(order.id);
  const claimed = await getAdminDb().runTransaction(async (tx) => {
    const fresh = await tx.get(orderRef);
    if (fresh.data()?.crmCompletedAt) return false;
    tx.update(orderRef, { crmCompletedAt: Date.now() });
    return true;
  });
  if (!claimed) return;

  const configSnap = await getAdminDb().doc(`checkoutConfigs/${order.configId}`).get();
  const crm: CheckoutCrmSettings = normalizeCrm(configSnap.data()?.crm);
  const config = { ...(configSnap.data() as Omit<CheckoutConfig, "id">), id: order.configId, crm, subAccountId: order.subAccountId, agencyId: order.agencyId, context: order.context } as CheckoutConfig;
  const now = Date.now();

  // Settle every open session for this buyer on this checkout.
  const open = (await sessionsCol().where("configId", "==", order.configId).where("email", "==", order.buyer.email).get()).docs
    .map((d) => toSession(d.id, d.data()))
    .filter((s) => s.id === order.sessionId || s.status === "started" || s.status === "abandoned");
  for (const s of open) {
    if (s.status === "completed" && s.orderId && s.orderId !== order.id) continue;
    await sessionsCol().doc(s.id).update({ status: "completed", completedAt: now, orderId: order.id, abandonDueAt: null, resumeTokenHash: null, updatedAt: now });
  }

  // The buyer's Contact: the one their Member is linked to, else by email.
  const member = (await getAdminDb().doc(`subAccounts/${order.subAccountId}/members/${order.memberId}`).get()).data();
  let contactId: string | null = (member?.contactId as string | undefined) ?? open.find((s) => s.contactId)?.contactId ?? null;
  if (contactId) {
    const c = (await getAdminDb().doc(`contacts/${contactId}`).get()).data();
    if (c?.subAccountId !== order.subAccountId) contactId = null;
  }
  contactId ??= await findExistingContactId(getAdminDb(), order.subAccountId, { email: order.buyer.email });
  if (!contactId) return;

  for (const s of open) {
    if (s.abandonment?.firedAt) await exitAbandonedCheckoutRuns({ subAccountId: order.subAccountId, contactId, checkoutSessionId: s.id }).catch(() => 0);
  }

  if (order.marketingOptIn && crm.marketingOptIn.enabled) {
    await recordMarketingConsent({ contactId, label: crm.marketingOptIn.label, configId: order.configId, sourceUrl: null }).catch(() => undefined);
  }
  const add = [
    ...crm.completed.tags,
    ...(order.marketingOptIn && crm.marketingOptIn.enabled ? crm.marketingOptIn.tags : []),
    ...(order.items.some((i) => i.role === "bump") ? crm.bumpPurchasedTags : []),
    ...(order.coupon ? crm.couponUsedTags : []),
  ];
  const remove = crm.completed.removeAbandonedTags ? crm.abandoned.tags : [];
  await changeTags(contactId, add, remove).catch((err) => console.error("[checkout-crm] completed tags failed", err));

  const primary = order.items.find((i) => i.role === "primary");
  await recordContactActivity({
    subAccountId: order.subAccountId,
    contactId,
    type: "checkout_completed",
    content: `Completed checkout${primary ? ` for ${primary.title}` : ""}${order.items.length > 1 ? ` with ${order.items.length - 1} add-on${order.items.length > 2 ? "s" : ""}` : ""}.`,
    createdBy: "checkout",
    dedupeKey: `checkout_completed_${order.id}`,
  });
  await emitCheckoutEvent({
    type: "checkout.completed",
    config,
    contactId,
    dedupeKey: `checkout-completed:${order.id}`,
    session: order.sessionId ? { id: order.sessionId, offerId: primary?.offerId ?? config.primaryOfferId ?? "" } : null,
    offerTitle: primary?.title ?? "",
    extra: {
      orderId: order.id,
      bumpOfferIds: order.items.filter((i) => i.role === "bump").map((i) => i.offerId),
      couponCode: order.coupon?.code ?? null,
      amountDueTodayCents: order.totals.dueTodayCents,
      currency: order.currency,
    },
    workflowId: crm.completed.workflowId,
  });
}

/* --------------------------------- Resume --------------------------------- */

export type ResumeResult =
  | { status: "ok"; sessionId: string; buyer: { name: string; email: string; phone: string }; bumpIds: string[]; couponCode: string | null }
  | { status: "completed" }
  | { status: "invalid" };

/**
 * A signed resume link → the buyer's details + last selection, for the
 * checkout page to PREFILL. Nothing here is trusted for money: the page
 * re-quotes every add-on and code through the normal server quote, which
 * drops anything no longer available, and payment re-validates again.
 */
export async function resumeCheckoutSession(configId: string, token: unknown): Promise<ResumeResult> {
  const verified = verifyResumeToken(token);
  if (!verified) return { status: "invalid" };
  const snap = await sessionsCol().doc(verified.sessionId).get();
  if (!snap.exists) return { status: "invalid" };
  const s = toSession(snap.id, snap.data()!);
  if (s.configId !== configId || !s.resumeTokenHash || s.resumeTokenHash !== verified.hash) {
    return s.configId === configId && s.status === "completed" ? { status: "completed" } : { status: "invalid" };
  }
  if (s.status === "completed") return { status: "completed" };
  if (s.status === "superseded") return { status: "invalid" };
  return { status: "ok", sessionId: s.id, buyer: { name: s.name, email: s.email, phone: s.phone }, bumpIds: s.bumpIds ?? [], couponCode: s.couponCode };
}
