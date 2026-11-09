import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { getCourseOffer, listCourseOffers } from "@/lib/server/course-offer-service";
import { offerBillingNote, offerPriceLabel } from "@/lib/course-offers/price-label";
import {
  bumpOfferProblem,
  defaultCheckoutFields,
  primaryOfferProblem,
  sanitizeCheckoutInput,
  validateBumps,
  type EditableCheckoutFields,
} from "@/lib/checkout/config";
import type { CheckoutConfig, PhoneRequirement } from "@/types/checkout";
import type { CourseOffer, CourseOfferCheckoutSettings } from "@/types/course-offers";
import { DEFAULT_COURSE_OFFER_CHECKOUT_SETTINGS } from "@/types/course-offers";
import { CheckoutError, agencyIdFor, assertId, newId } from "./common";

/**
 * Checkout configurations — one document per checkout CONTEXT
 * (`checkoutConfigs/{id}`, server-only). A Funnel Checkout Step and an
 * Offer's hosted checkout are separate contexts, so the same primary Offer
 * can carry different Order Bumps in each, and saving one never touches
 * the other.
 *
 * Hosted checkouts keep their buyer-field and agreement settings in the
 * Offer's existing `checkoutSettings` (the classic enroll form reads the
 * same fields), so there is exactly one stored copy of each setting.
 */

const configsCol = () => getAdminDb().collection("checkoutConfigs");
export const hostedConfigId = (offerId: string) => `hosted_${offerId}`;

/* ------------------------------ Offer facts ------------------------------ */

export interface OfferOption {
  id: string;
  title: string;
  type: CourseOffer["type"];
  priceCents: number | null;
  currency: string;
  recurringInterval: CourseOffer["recurringInterval"];
  trialDays: number;
  visibility: CourseOffer["visibility"];
  systemManaged: boolean;
  thumbnailUrl: string | null;
  priceLabel: string;
  billingNote: string | null;
  entitlements: string[];
  /** Why it can't be a primary Offer (null when it can). */
  primaryProblem: string | null;
}

export function entitlementSummary(offer: CourseOffer, courseTitles: Map<string, string>): string[] {
  const out: string[] = [];
  for (const id of offer.courseIds) out.push(`Course: ${courseTitles.get(id)?.trim() || "Untitled course"}`);
  if (offer.booking) out.push(`${offer.booking.sessionCount} ${offer.booking.sessionCount === 1 ? "session" : "sessions"}: ${offer.booking.bookingPageName}`);
  for (const p of offer.projectTemplates ?? []) out.push(`Project: ${p.templateTitle}`);
  const communities = (offer.communityAccess ?? []).length;
  if (communities) out.push(communities === 1 ? "Community access" : `Access to ${communities} Community levels`);
  return out;
}

export async function courseTitlesFor(subAccountId: string): Promise<Map<string, string>> {
  const snap = await getAdminDb().collection(`subAccounts/${subAccountId}/standaloneCourses`).select("title").get();
  return new Map(snap.docs.map((d) => [d.id, ((d.data().title as string) ?? "").trim() || "Untitled course"]));
}

export function toOfferOption(offer: CourseOffer, titles: Map<string, string>): OfferOption {
  return {
    id: offer.id,
    title: offer.title,
    type: offer.type,
    priceCents: offer.priceCents,
    currency: (offer.currency ?? "USD").toUpperCase(),
    recurringInterval: offer.recurringInterval,
    trialDays: offer.trialDays ?? 0,
    visibility: offer.visibility,
    systemManaged: offer.systemManaged === true,
    thumbnailUrl: offer.thumbnailUrl,
    priceLabel: offerPriceLabel(offer),
    billingNote: offerBillingNote(offer),
    entitlements: entitlementSummary(offer, titles),
    primaryProblem: primaryOfferProblem(offer, offer.subAccountId),
  };
}

/** Every non-archived Offer in the workspace, for the Offer pickers. */
export async function listOfferOptions(subAccountId: string): Promise<OfferOption[]> {
  const [offers, titles] = await Promise.all([listCourseOffers(subAccountId), courseTitlesFor(subAccountId)]);
  return offers.filter((o) => o.visibility !== "archived").map((o) => toOfferOption(o, titles));
}

async function loadOffers(subAccountId: string, ids: string[]): Promise<Map<string, CourseOffer>> {
  const unique = [...new Set(ids.filter(Boolean))];
  const offers = await Promise.all(unique.map((id) => getCourseOffer(subAccountId, id)));
  return new Map(offers.filter((o): o is CourseOffer => !!o).map((o) => [o.id, o]));
}

/* -------------------------------- Reading -------------------------------- */

function phoneFromSettings(s: CourseOfferCheckoutSettings): PhoneRequirement {
  if (!s.collectPhoneNumber) return "hidden";
  return s.phoneRequirement === "optional" ? "optional" : "required";
}

function fromDoc(id: string, data: FirebaseFirestore.DocumentData): CheckoutConfig {
  const defaults = defaultCheckoutFields(data.primaryOfferId ?? null, data.context?.type ?? "funnel_step");
  return {
    ...defaults,
    ...(data as Partial<CheckoutConfig>),
    display: { ...defaults.display, ...(data.display ?? {}) },
    agreement: { ...defaults.agreement, ...(data.agreement ?? {}) },
    bumps: Array.isArray(data.bumps) ? data.bumps : [],
    id,
  } as CheckoutConfig;
}

export async function getCheckoutConfigDoc(configId: string): Promise<CheckoutConfig | null> {
  const snap = await configsCol().doc(configId).get();
  return snap.exists ? fromDoc(snap.id, snap.data()!) : null;
}

/** Overlay the hosted Offer's canonical buyer/agreement settings. */
function overlayHosted(config: CheckoutConfig, offer: CourseOffer): CheckoutConfig {
  const s = offer.checkoutSettings ?? DEFAULT_COURSE_OFFER_CHECKOUT_SETTINGS;
  return {
    ...config,
    primaryOfferId: offer.id,
    phone: phoneFromSettings(s),
    agreement: { ...s.serviceAgreement },
  };
}

/** The hosted checkout config for an Offer (defaults when never saved). */
export async function getHostedCheckoutConfig(subAccountId: string, offerId: string): Promise<{ config: CheckoutConfig; offer: CourseOffer; saved: boolean }> {
  assertId(offerId, "offer");
  const offer = await getCourseOffer(subAccountId, offerId);
  if (!offer || offer.subAccountId !== subAccountId) throw new CheckoutError("Offer not found.", 404);
  const existing = await getCheckoutConfigDoc(hostedConfigId(offerId));
  if (existing && existing.subAccountId !== subAccountId) throw new CheckoutError("Offer not found.", 404);
  const now = Date.now();
  const config: CheckoutConfig =
    existing ??
    ({
      ...defaultCheckoutFields(offerId, "hosted_offer"),
      id: hostedConfigId(offerId),
      agencyId: offer.agencyId,
      subAccountId,
      context: { type: "hosted_offer", offerId },
      version: 0,
      createdAt: now,
      updatedAt: now,
      updatedByUid: null,
    } as CheckoutConfig);
  return { config: overlayHosted(config, offer), offer, saved: !!existing };
}

export async function createStepCheckoutConfig(input: { subAccountId: string; agencyId: string; funnelId: string; stepId: string }): Promise<CheckoutConfig> {
  const id = `step_${input.stepId}`;
  const now = Date.now();
  const config: Omit<CheckoutConfig, "id"> = {
    ...defaultCheckoutFields(null, "funnel_step"),
    agencyId: input.agencyId,
    subAccountId: input.subAccountId,
    context: { type: "funnel_step", funnelId: input.funnelId, stepId: input.stepId },
    version: 1,
    createdAt: now,
    updatedAt: now,
    updatedByUid: null,
  };
  await configsCol().doc(id).set(config);
  return { id, ...config };
}

export async function deleteCheckoutConfig(configId: string): Promise<void> {
  await configsCol().doc(configId).delete();
}

/**
 * Owner decision (2026-11-09): Offers created from now on start with the new
 * hosted checkout switched ON (sensible defaults, no bumps, discount codes
 * off) — creators can change it in Checkout Settings. Existing Offers are
 * never touched (no doc is written for them). Never for system-managed
 * Community pricing Offers. Idempotent: `create()` refuses an existing doc.
 */
export async function initializeHostedCheckoutForNewOffer(input: { subAccountId: string; agencyId: string; offerId: string }): Promise<void> {
  const now = Date.now();
  const config: Omit<CheckoutConfig, "id"> = {
    ...defaultCheckoutFields(input.offerId, "hosted_offer"),
    enabled: true,
    agencyId: input.agencyId,
    subAccountId: input.subAccountId,
    context: { type: "hosted_offer", offerId: input.offerId },
    version: 1,
    createdAt: now,
    updatedAt: now,
    updatedByUid: null,
  };
  await configsCol()
    .doc(hostedConfigId(input.offerId))
    .create(config)
    .catch((err: { code?: number }) => {
      if (err?.code !== 6) throw err; // 6 = ALREADY_EXISTS
    });
}

/** A funnel step's config, tenancy-checked against the step itself. */
export async function getStepCheckoutConfig(subAccountId: string, funnelId: string, stepId: string): Promise<CheckoutConfig> {
  const config = await getCheckoutConfigDoc(`step_${assertId(stepId, "step")}`);
  if (
    !config ||
    config.subAccountId !== subAccountId ||
    config.context.type !== "funnel_step" ||
    config.context.funnelId !== funnelId ||
    config.context.stepId !== stepId
  ) {
    throw new CheckoutError("Checkout step not found.", 404);
  }
  return config;
}

/* -------------------------------- Saving --------------------------------- */

async function validateAgainstOffers(subAccountId: string, value: EditableCheckoutFields, previous: CheckoutConfig): Promise<Record<string, string>> {
  const ids = [value.primaryOfferId ?? "", ...value.bumps.map((b) => b.offerId)];
  const offers = await loadOffers(subAccountId, ids);
  const errors: Record<string, string> = {};
  const primary = value.primaryOfferId ? offers.get(value.primaryOfferId) ?? null : null;
  if (value.primaryOfferId) {
    const problem = primaryOfferProblem(primary, subAccountId);
    // A hosted checkout always belongs to its own Offer — only tenancy matters there.
    if (problem && (previous.context.type === "funnel_step" || !primary || primary.subAccountId !== subAccountId)) errors.primaryOfferId = problem;
  }
  Object.assign(errors, validateBumps(value.bumps, previous.bumps, offers, primary, subAccountId));
  return errors;
}

async function persist(config: CheckoutConfig, value: EditableCheckoutFields, uid: string): Promise<CheckoutConfig> {
  const next: CheckoutConfig = { ...config, ...value, version: config.version + 1, updatedAt: Date.now(), updatedByUid: uid };
  await configsCol().doc(config.id).set(next);
  return next;
}

export async function saveStepCheckoutConfig(input: { subAccountId: string; funnelId: string; stepId: string; uid: string; body: Record<string, unknown> }): Promise<CheckoutConfig> {
  const current = await getStepCheckoutConfig(input.subAccountId, input.funnelId, input.stepId);
  const { value, errors } = sanitizeCheckoutInput(input.body, current, "funnel_step", newId);
  if (value.postPurchase.type === "funnel_step") {
    const step = await getAdminDb().doc(`funnels/${input.funnelId}/steps/${value.postPurchase.stepId}`).get();
    if (!step.exists || step.id === input.stepId) errors.postPurchase = "Choose another step in this funnel.";
  }
  Object.assign(errors, await validateAgainstOffers(input.subAccountId, value, current));
  if (Object.keys(errors).length) throw new CheckoutError("Fix the highlighted settings.", 400, errors);
  return persist(current, value, input.uid);
}

export async function saveHostedCheckoutConfig(input: { subAccountId: string; offerId: string; uid: string; body: Record<string, unknown> }): Promise<CheckoutConfig> {
  const { config: current, offer, saved } = await getHostedCheckoutConfig(input.subAccountId, input.offerId);
  if (offer.systemManaged) throw new CheckoutError("Community pricing Offers are checked out by the Community.", 400);
  const { value, errors } = sanitizeCheckoutInput(input.body, current, "hosted_offer", newId);
  Object.assign(errors, await validateAgainstOffers(input.subAccountId, value, current));
  if (value.postPurchase.type === "page") {
    const page = await getAdminDb().doc(`pages/${value.postPurchase.pageId}`).get();
    if (!page.exists || page.data()?.subAccountId !== input.subAccountId) errors.postPurchase = "Choose a page from this workspace.";
  }
  if (Object.keys(errors).length) throw new CheckoutError("Fix the highlighted settings.", 400, errors);

  // Buyer phone + agreement live on the Offer (single source shared with the
  // classic enroll form). `collectAddress` stays as it was — it only affects
  // the classic form; the new checkout never asks for an address itself.
  const legacy = offer.checkoutSettings ?? DEFAULT_COURSE_OFFER_CHECKOUT_SETTINGS;
  const collectAddress = typeof input.body.classicCollectAddress === "boolean" ? input.body.classicCollectAddress : legacy.collectAddress;
  const nextSettings: CourseOfferCheckoutSettings = {
    collectAddress,
    collectPhoneNumber: value.phone !== "hidden",
    ...(value.phone !== "hidden" ? { phoneRequirement: value.phone } : {}),
    serviceAgreement: { ...value.agreement },
  };
  await getAdminDb()
    .doc(`subAccounts/${input.subAccountId}/courseOffers/${input.offerId}`)
    .update({ checkoutSettings: nextSettings, updatedAt: FieldValue.serverTimestamp() });
  const base: CheckoutConfig = saved ? current : { ...current, agencyId: offer.agencyId || (await agencyIdFor(input.subAccountId)) };
  const next = await persist(base, value, input.uid);
  return overlayHosted(next, { ...offer, checkoutSettings: nextSettings });
}

/** Admin view: the config plus everything the editor needs to render it. */
export async function checkoutEditorPayload(subAccountId: string, config: CheckoutConfig) {
  const options = await listOfferOptions(subAccountId);
  const byId = new Map(options.map((o) => [o.id, o]));
  const primary = config.primaryOfferId ? byId.get(config.primaryOfferId) ?? null : null;
  const bumpStatus = Object.fromEntries(
    config.bumps.map((b) => {
      const o = byId.get(b.offerId);
      const problem = o
        ? bumpOfferProblem(
            { id: o.id, subAccountId, type: o.type, priceCents: o.priceCents, currency: o.currency, visibility: o.visibility, systemManaged: o.systemManaged },
            primary ? { id: primary.id, subAccountId, type: primary.type, priceCents: primary.priceCents, currency: primary.currency, visibility: primary.visibility } : null,
            subAccountId,
          )
        : "This Offer was deleted.";
      return [b.id, problem];
    }),
  );
  return { config, offers: options, bumpStatus };
}
