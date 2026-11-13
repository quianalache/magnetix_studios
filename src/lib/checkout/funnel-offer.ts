/**
 * Upsell / Downsell step Offer settings — PURE rules (Pages & Funnels).
 *
 * One place for: reading stored settings (older steps have none), cleaning
 * editor input, what an Offer needs to be sold on a post-purchase step, the
 * payment prerequisites, the step's configuration status, and the RUNTIME
 * CONTRACT the funnel-session runtime follows:
 *   - Accept CRM actions / access only after a CONFIRMED SUCCESSFUL payment
 *     (owner decision "Option A") — or, for a free-trial subscription Offer,
 *     after a VERIFIED trial activation with a card authorized for future
 *     billing (owner decision 2026-11-13; never counted as a payment);
 *   - Decline CRM actions only after an intentional decline;
 *   - a failed / pending / authentication-required payment is neither: the
 *     buyer stays on the step with an inline payment form.
 * No I/O here; the server service validates ownership and persists.
 */
import { tagKey } from "@/lib/contacts/tag-names";
import type { StepCrmAction, StepOfferSettings, StepPaymentSettings } from "@/types/checkout";

export const MAX_STEP_ACTION_TAGS = 10;
const MAX_TAG_LENGTH = 60;
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

export const DEFAULT_STEP_PAYMENT: StepPaymentSettings = {
  method: "one_click",
  onFailure: "stay_on_step_inline_payment",
  recurringDisclosureAcknowledged: false,
};

const emptyAction = (): StepCrmAction => ({ addTags: [], removeTags: [], workflowId: null });

export function defaultStepOffer(): StepOfferSettings {
  return { offerId: null, payment: { ...DEFAULT_STEP_PAYMENT }, onAccept: emptyAction(), onDecline: emptyAction() };
}

/** Trim, collapse spaces, de-duplicate by tag identity (tagKey) and cap. */
export function cleanStepTags(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const t of raw) {
    if (typeof t !== "string") continue;
    const tag = t.replace(/\s+/g, " ").trim().slice(0, MAX_TAG_LENGTH);
    const k = tagKey(tag);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(tag);
    if (out.length >= MAX_STEP_ACTION_TAGS) break;
  }
  return out;
}

const idRef = (v: unknown): string | null => (typeof v === "string" && ID_RE.test(v.trim()) ? v.trim() : null);

function normalizeInvalid(raw: unknown): NonNullable<StepCrmAction["invalidTags"]> {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((x): x is Record<string, unknown> => !!x && typeof x === "object")
    .filter((x) => x.reason === "tag_deleted" && typeof x.tag === "string" && (x.list === "addTags" || x.list === "removeTags"))
    .slice(0, 20)
    .map((x) => ({ reason: "tag_deleted" as const, tag: String(x.tag).slice(0, MAX_TAG_LENGTH), list: x.list as "addTags" | "removeTags", at: typeof x.at === "number" ? x.at : 0 }));
}

export function normalizeAction(raw: unknown): StepCrmAction {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const invalid = normalizeInvalid(r.invalidTags);
  return {
    addTags: cleanStepTags(r.addTags),
    removeTags: cleanStepTags(r.removeTags),
    workflowId: idRef(r.workflowId),
    ...(invalid.length ? { invalidTags: invalid } : {}),
  };
}

/** Read stored (possibly absent / partial / legacy) settings with defaults. */
export function normalizeStepOffer(raw: unknown): StepOfferSettings {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const p = (r.payment && typeof r.payment === "object" ? r.payment : {}) as Record<string, unknown>;
  return {
    offerId: idRef(r.offerId),
    payment: {
      method: "one_click",
      onFailure: "stay_on_step_inline_payment",
      recurringDisclosureAcknowledged: p.recurringDisclosureAcknowledged === true,
    },
    onAccept: normalizeAction(r.onAccept),
    onDecline: normalizeAction(r.onDecline),
  };
}

/**
 * Editor input → settings. Never accepts price, currency, interval or any
 * payment credential (unknown keys are dropped). Field errors are keyed for
 * the form. Repair markers (`invalidTags`) can only be KEPT or DISMISSED —
 * never invented by the client.
 */
export function sanitizeStepOfferInput(raw: unknown, previous: StepOfferSettings): { value: StepOfferSettings; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const value = normalizeStepOffer(r);
  if (r.offerId !== undefined && r.offerId !== null && !value.offerId) errors.offerId = "Choose an Offer from this workspace.";
  for (const side of ["onAccept", "onDecline"] as const) {
    const a = value[side];
    const rawSide = (r[side] && typeof r[side] === "object" ? r[side] : {}) as Record<string, unknown>;
    if (rawSide.workflowId !== undefined && rawSide.workflowId !== null && !a.workflowId) errors[`${side}.workflowId`] = "Choose a Workflow from this workspace.";
    const overlap = a.addTags.filter((t) => a.removeTags.some((x) => tagKey(x) === tagKey(t)));
    if (overlap.length) errors[`${side}.tags`] = `“${overlap[0]}” can't be both added and removed.`;
    // Only previously stored repair markers survive.
    const prior = previous[side].invalidTags ?? [];
    const kept = (a.invalidTags ?? []).filter((m) => prior.some((p) => p.list === m.list && tagKey(p.tag) === tagKey(m.tag)));
    if (kept.length) a.invalidTags = prior.filter((p) => kept.some((m) => m.list === p.list && tagKey(p.tag) === tagKey(m.tag)));
    else delete a.invalidTags;
  }
  return { value, errors };
}

/* ------------------------------ Offer rules ------------------------------ */

/** The Offer facts these rules need (server and client shapes both fit). */
export interface StepOfferFacts {
  id: string;
  subAccountId?: string;
  title: string;
  type: "free" | "oneTime" | "recurring";
  priceCents: number | null;
  currency: string | null;
  recurringInterval: "day" | "week" | "month" | "year" | null;
  trialDays?: number | null;
  visibility: string;
  systemManaged?: boolean;
}

/** Why an Offer can't be NEWLY chosen for an Upsell / Downsell step, or null. */
export function stepOfferProblem(offer: StepOfferFacts | null, subAccountId: string): string | null {
  if (!offer || (offer.subAccountId !== undefined && offer.subAccountId !== subAccountId)) return "That Offer isn't in this workspace.";
  if (offer.systemManaged) return "Community pricing Offers are managed by the Community and can't be sold here.";
  if (offer.visibility === "archived") return "That Offer is archived.";
  if (offer.type === "free") return "Free Offers have nothing to charge. Choose a paid one-time or subscription Offer.";
  if (!offer.priceCents || offer.priceCents <= 0) return "This Offer has no price yet. Set its price on the Offer first.";
  if (!offer.currency) return "This Offer has no currency yet. Set it on the Offer first.";
  if (offer.type === "recurring" && !offer.recurringInterval) return "This subscription Offer has no billing interval yet. Set it on the Offer first.";
  return null;
}

/** A saved Offer that later changed: keep the reference, but say what needs attention. */
export function savedOfferAttention(offer: StepOfferFacts | null, subAccountId: string): string | null {
  if (!offer) return "The Offer chosen for this step was deleted. Choose another Offer.";
  const problem = stepOfferProblem(offer, subAccountId);
  return problem ? `${problem.replace(/^That Offer/, "The chosen Offer")}` : null;
}

export const INTERVAL_LABEL: Record<NonNullable<StepOfferFacts["recurringInterval"]>, string> = {
  day: "day",
  week: "week",
  month: "month",
  year: "year",
};

export function billingSummary(offer: StepOfferFacts): string {
  if (offer.type === "free") return "Free";
  if (offer.type === "recurring") return offer.recurringInterval ? `Subscription · every ${INTERVAL_LABEL[offer.recurringInterval]}` : "Subscription · interval not set";
  return "One-time payment";
}

/* --------------------------- Payment prerequisites --------------------------- */

export type PrerequisiteState = "met" | "missing" | "attention";

export interface PaymentPrerequisite {
  key: "offer" | "stripe" | "saved_payment_method" | "recurring_disclosure";
  label: string;
  state: PrerequisiteState;
  detail: string;
}

export interface PaymentReadinessInput {
  offer: StepOfferFacts | null;
  offerAttention: string | null;
  /** Workspace card payments for the Offer's mode: connected account with charges enabled, or the agency's shared account. */
  stripe: "ready" | "not_connected" | "charges_disabled" | "unknown";
  /** A Checkout step comes before this step in the funnel (it saves the payment method used for one-click). */
  hasEarlierCheckout: boolean;
  recurringDisclosureAcknowledged: boolean;
}

export function paymentPrerequisites(input: PaymentReadinessInput): PaymentPrerequisite[] {
  const out: PaymentPrerequisite[] = [];
  out.push(
    !input.offer
      ? { key: "offer", label: "Offer", state: "missing", detail: "Choose the Offer this step sells." }
      : input.offerAttention
        ? { key: "offer", label: "Offer", state: "attention", detail: input.offerAttention }
        : { key: "offer", label: "Offer", state: "met", detail: `${input.offer.title} · ${billingSummary(input.offer)}` },
  );
  out.push(
    input.stripe === "ready"
      ? { key: "stripe", label: "Card payments", state: "met", detail: "Stripe is connected and can accept charges." }
      : input.stripe === "charges_disabled"
        ? { key: "stripe", label: "Card payments", state: "attention", detail: "Stripe is connected but can't accept charges yet. Finish Stripe's onboarding in Settings → Payments." }
        : input.stripe === "not_connected"
          ? { key: "stripe", label: "Card payments", state: "missing", detail: "Connect Stripe in Settings → Payments so this workspace can take card payments." }
          : { key: "stripe", label: "Card payments", state: "attention", detail: "Card payment status couldn't be checked." },
  );
  out.push(
    input.hasEarlierCheckout
      ? { key: "saved_payment_method", label: "Saved payment method", state: "met", detail: "A Checkout step earlier in this funnel saves the buyer's payment method for one-click." }
      : { key: "saved_payment_method", label: "Saved payment method", state: "missing", detail: "Add a Checkout step before this step. One-click uses the payment method the buyer entered there." },
  );
  if (input.offer?.type === "recurring") {
    const trial = (input.offer.trialDays ?? 0) > 0;
    out.push(
      input.recurringDisclosureAcknowledged
        ? {
            key: "recurring_disclosure",
            label: "Subscription disclosure",
            state: "met",
            detail: trial
              ? `Buyers will see the ${input.offer.trialDays}-day free trial, $0 due today, the recurring amount, how often they're billed, when billing starts and the terms, and must agree before the trial starts. Their card is authorized for the future charges.`
              : "Buyers will be shown the recurring amount, how often they're billed and the terms, and must agree before the subscription starts.",
          }
        : { key: "recurring_disclosure", label: "Subscription disclosure", state: "missing", detail: "Confirm the subscription disclosure below." },
    );
  }
  return out;
}

export type StepConfigStatus = "missing" | "attention" | "complete";

/** Configuration status — NOT whether a charge can run (see `COMMERCE_CAPABILITIES`). */
export function stepConfigStatus(prereqs: PaymentPrerequisite[], crmAttention: number): StepConfigStatus {
  if (prereqs.some((p) => p.state === "attention") || crmAttention > 0) return "attention";
  if (prereqs.some((p) => p.state === "missing")) return "missing";
  return "complete";
}

/* ------------------------- Runtime outcome contract ------------------------- */

/**
 * What can happen on an Upsell / Downsell step in a funnel session. Intent to
 * accept, a confirmed purchase, a failed payment and an intentional decline
 * are DIFFERENT business outcomes.
 */
export type FunnelOfferOutcome =
  | "accept_clicked"
  | "payment_pending"
  | "authentication_required"
  | "payment_failed"
  | "payment_succeeded"
  /**
   * Owner decision (2026-11-13): a free-trial subscription Offer is ACCEPTED
   * once Stripe verifies the subscription as trialing with a card authorized
   * for future billing — nothing is charged, and it is never a "payment".
   */
  | "trial_activated"
  | "declined";

export interface OutcomeEffects {
  /** CRM actions to run (null = none). */
  crm: { side: "onAccept" | "onDecline"; action: StepCrmAction } | null;
  /** Where the buyer goes: the step's Accept / Decline route, or stay on the step. */
  route: "accept" | "decline" | "stay";
  showInlinePaymentForm: boolean;
  grantAccess: boolean;
  /** Record the purchase (its verified payment flows through the trusted Stripe payment events). */
  recordPurchase: boolean;
}

/** The one place the timing rules live; the runtime must call this. */
export function outcomeEffects(outcome: FunnelOfferOutcome, settings: StepOfferSettings): OutcomeEffects {
  switch (outcome) {
    case "payment_succeeded":
    case "trial_activated":
      return { crm: { side: "onAccept", action: settings.onAccept }, route: "accept", showInlinePaymentForm: false, grantAccess: true, recordPurchase: true };
    case "declined":
      return { crm: { side: "onDecline", action: settings.onDecline }, route: "decline", showInlinePaymentForm: false, grantAccess: false, recordPurchase: false };
    case "payment_failed":
    case "authentication_required":
      return { crm: null, route: "stay", showInlinePaymentForm: true, grantAccess: false, recordPurchase: false };
    case "accept_clicked":
    case "payment_pending":
    default:
      return { crm: null, route: "stay", showInlinePaymentForm: false, grantAccess: false, recordPurchase: false };
  }
}

/**
 * Idempotency key for running an outcome's CRM actions once: one per funnel
 * session + step + outcome (+ the payment for a successful purchase, so a
 * redelivered webhook or a retried success can't run them twice).
 */
export function outcomeActionKey(input: { sessionId: string; stepId: string; outcome: "payment_succeeded" | "trial_activated" | "declined"; paymentRef?: string | null }): string {
  return ["funnel_offer", input.sessionId, input.stepId, input.outcome, input.outcome === "declined" ? "" : input.paymentRef ?? ""].join(":");
}

/** CRM actions that can actually run: tags marked deleted are never executed. */
export function runnableAction(action: StepCrmAction): StepCrmAction {
  const dead = new Set((action.invalidTags ?? []).map((m) => tagKey(m.tag)));
  return {
    addTags: action.addTags.filter((t) => !dead.has(tagKey(t))),
    removeTags: action.removeTags.filter((t) => !dead.has(tagKey(t))),
    workflowId: action.workflowId,
  };
}
