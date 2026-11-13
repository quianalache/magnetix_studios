import "server-only";

import { getAdminDb } from "@/lib/firebase/admin";
import { tagKey } from "@/lib/contacts/tag-names";
import { getCourseOffer } from "@/lib/server/course-offer-service";
import { listTags } from "@/lib/server/contact-tags/service";
import { getStripeConnectionForEnvironment, getStripeEnvironment, normalizePaymentMode } from "@/lib/stripe/server";
import { COMMERCE_CAPABILITIES } from "@/lib/checkout/capabilities";
import { normalizeStepOffer, stepOfferProblem, type StepOfferFacts } from "@/lib/checkout/funnel-offer";
import type { StepCrmAction, StepOfferSettings } from "@/types/checkout";
import type { CourseOffer } from "@/types/course-offers";
import { listOfferOptions, listWorkflowOptions, toOfferOption, type OfferOption } from "./config-service";

/**
 * Upsell / Downsell step Offer settings — server side: ownership checks for
 * every referenced Offer, tag and Workflow, and the read model for Step
 * Settings. Saving settings has no side effects: nothing is charged, no
 * access is granted, no tag is applied or created, no Workflow is started.
 */

export function offerFacts(offer: CourseOffer): StepOfferFacts {
  return {
    id: offer.id,
    subAccountId: offer.subAccountId,
    title: offer.title,
    type: offer.type,
    priceCents: offer.priceCents ?? null,
    currency: offer.currency ? offer.currency.toUpperCase() : null,
    recurringInterval: offer.recurringInterval ?? null,
    trialDays: offer.trialDays ?? 0,
    visibility: offer.visibility,
    systemManaged: offer.systemManaged === true,
  };
}

/** key → canonical display name, for every tag in the workspace's Tags library. */
async function libraryTagNames(subAccountId: string): Promise<Map<string, string>> {
  const { tags } = await listTags({ subAccountId, territoryIds: null, canManage: true });
  const out = new Map<string, string>();
  for (const t of tags) {
    out.set(tagKey(t.name), t.name);
    for (const v of t.variants) if (!out.has(tagKey(v.name))) out.set(tagKey(v.name), t.name);
  }
  return out;
}

/**
 * Check a step's Offer settings against this workspace, return the value to
 * store (tags in their library spelling) and field errors. Already-saved
 * references are kept even if they later became unavailable (they're shown
 * as needing attention); NEW choices must be valid.
 */
export async function validateStepOffer(input: {
  subAccountId: string;
  value: StepOfferSettings;
  previous: StepOfferSettings;
}): Promise<{ value: StepOfferSettings; errors: Record<string, string> }> {
  const { subAccountId, previous } = input;
  const value: StepOfferSettings = JSON.parse(JSON.stringify(input.value));
  const errors: Record<string, string> = {};

  if (value.offerId && value.offerId !== previous.offerId) {
    const offer = await getCourseOffer(subAccountId, value.offerId).catch(() => null);
    const problem = stepOfferProblem(offer && offer.subAccountId === subAccountId ? offerFacts(offer) : null, subAccountId);
    if (problem) errors.offerId = problem;
  }

  const prevKeys = (a: StepCrmAction, list: "addTags" | "removeTags") => new Set(a[list].map(tagKey));
  let library: Map<string, string> | null = null;
  for (const side of ["onAccept", "onDecline"] as const) {
    for (const list of ["addTags", "removeTags"] as const) {
      const kept = prevKeys(previous[side], list);
      const fresh = value[side][list].filter((t) => !kept.has(tagKey(t)));
      if (!fresh.length) continue;
      library ??= await libraryTagNames(subAccountId);
      const missing = fresh.find((t) => !library!.has(tagKey(t)));
      if (missing) {
        errors[`${side}.tags`] = `“${missing}” isn't in your Tags library. Create it in Contacts → Tags first, or choose an existing tag.`;
        continue;
      }
      value[side][list] = value[side][list].map((t) => (kept.has(tagKey(t)) ? t : library!.get(tagKey(t)) ?? t));
    }
    const wid = value[side].workflowId;
    if (wid && wid !== previous[side].workflowId) {
      const snap = await getAdminDb().doc(`workflows/${wid}`).get();
      if (!snap.exists || snap.data()?.subAccountId !== subAccountId) errors[`${side}.workflowId`] = "Choose a Workflow from this workspace.";
      else if (snap.data()?.status !== "active") errors[`${side}.workflowId`] = "Choose an active Workflow (this one is paused or a draft).";
    }
  }
  return { value, errors };
}

export type StripeReadiness = "ready" | "not_connected" | "charges_disabled" | "unknown";

/**
 * Can this workspace take card payments for the Offer's payment mode? Read
 * from stored workspace data only — no Stripe API call. Mirrors the checkout
 * engine's rule: the workspace's connected account for that mode, or the
 * agency's shared account when the agency enabled it.
 */
export async function stripeReadiness(subAccountId: string, offer: CourseOffer | null): Promise<StripeReadiness> {
  try {
    const sa = (await getAdminDb().doc(`subAccounts/${subAccountId}`).get()).data();
    let env: "test" | "live";
    try {
      env = normalizePaymentMode(offer?.paymentMode, getStripeEnvironment());
    } catch {
      env = normalizePaymentMode(offer?.paymentMode, "test");
    }
    const conn = getStripeConnectionForEnvironment(sa?.stripeConnect, env);
    if (conn?.accountId) return conn.chargesEnabled === false ? "charges_disabled" : "ready";
    return sa?.stripeCourseCheckoutEnabledByAgency === true ? "ready" : "not_connected";
  } catch {
    return "unknown";
  }
}

export interface StepOfferSettingsPayload {
  settings: StepOfferSettings;
  /** Offers that can be chosen (+ the saved one even when it's no longer choosable). */
  offers: Array<OfferOption & { stepProblem: string | null }>;
  /** The saved Offer, or null when none / deleted. */
  savedOffer: (OfferOption & { stepProblem: string | null }) | null;
  savedOfferDeleted: boolean;
  workflows: Awaited<ReturnType<typeof listWorkflowOptions>>;
  stripe: StripeReadiness;
  runtime: { postPurchaseCharging: boolean };
}

/** Everything Step Settings needs for the Offer / Payment / CRM sections. */
export async function stepOfferSettingsPayload(subAccountId: string, rawSettings: unknown): Promise<StepOfferSettingsPayload> {
  const settings = normalizeStepOffer(rawSettings);
  const [options, workflows, savedRaw] = await Promise.all([
    listOfferOptions(subAccountId),
    listWorkflowOptions(subAccountId),
    settings.offerId ? getCourseOffer(subAccountId, settings.offerId).catch(() => null) : Promise.resolve(null),
  ]);
  const saved = savedRaw && savedRaw.subAccountId === subAccountId ? savedRaw : null;
  const withProblem = (o: OfferOption) => ({
    ...o,
    stepProblem: stepOfferProblem(
      { id: o.id, subAccountId, title: o.title, type: o.type, priceCents: o.priceCents, currency: o.currency, recurringInterval: o.recurringInterval, visibility: o.visibility, systemManaged: o.systemManaged },
      subAccountId,
    ),
  });
  const offers = options.map(withProblem);
  let savedOffer = settings.offerId ? offers.find((o) => o.id === settings.offerId) ?? null : null;
  if (!savedOffer && saved) {
    // e.g. archived since it was chosen: still shown, flagged.
    savedOffer = withProblem(toOfferOption(saved, new Map()));
  }
  return {
    settings,
    offers,
    savedOffer,
    savedOfferDeleted: !!settings.offerId && !saved,
    workflows,
    stripe: await stripeReadiness(subAccountId, saved),
    runtime: { postPurchaseCharging: COMMERCE_CAPABILITIES.funnelPostPurchaseCharging },
  };
}
