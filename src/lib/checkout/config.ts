/**
 * Checkout configuration — PURE rules shared by the Funnel Checkout Step and
 * the hosted Offer checkout: defaults, input sanitising, and Order Bump
 * eligibility. No Firestore here; the service layer loads Offers and calls in.
 */
import type {
  CheckoutBump,
  CheckoutConfig,
  CheckoutDisplay,
  PostPurchaseDestination,
} from "@/types/checkout";
import type { CourseOffer } from "@/types/course-offers";
import { DEFAULT_SERVICE_AGREEMENT_TEXT } from "@/types/course-offers";

export const MAX_ORDER_BUMPS = 5;

export const DEFAULT_CHECKOUT_DISPLAY: CheckoutDisplay = {
  headline: "Complete your order",
  subheadline: "",
  showRecurringTerms: true,
  showTrialTiming: true,
  showDueToday: true,
  showEntitlements: true,
  guaranteeEnabled: false,
  guaranteeTitle: "",
  guaranteeText: "",
  showSecureBadge: true,
  submitLabel: "",
};

export type EditableCheckoutFields = Pick<
  CheckoutConfig,
  | "primaryOfferId"
  | "enabled"
  | "format"
  | "nameFormat"
  | "phone"
  | "billingAddress"
  | "agreement"
  | "couponsEnabled"
  | "bumps"
  | "display"
  | "postPurchase"
  | "internalNotes"
>;

export function defaultCheckoutFields(primaryOfferId: string | null, contextType: CheckoutConfig["context"]["type"]): EditableCheckoutFields {
  return {
    primaryOfferId,
    enabled: contextType === "funnel_step",
    format: "one_step",
    nameFormat: "full",
    phone: "hidden",
    billingAddress: "auto",
    agreement: { mode: "notRequired", customText: DEFAULT_SERVICE_AGREEMENT_TEXT, linkUrl: "" },
    couponsEnabled: false,
    bumps: [],
    display: { ...DEFAULT_CHECKOUT_DISPLAY },
    postPurchase: contextType === "funnel_step" ? { type: "funnel_next_step" } : { type: "space" },
    internalNotes: "",
  };
}

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const bool = (v: unknown, fallback: boolean) => (typeof v === "boolean" ? v : fallback);
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

export function isSafeHttpUrl(v: string): boolean {
  if (!v) return false;
  try {
    const u = new URL(v);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

function sanitizeDestination(raw: unknown, contextType: CheckoutConfig["context"]["type"], errors: Record<string, string>): PostPurchaseDestination {
  const d = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  switch (d.type) {
    case "url": {
      const url = str(d.url, 2000);
      if (!isSafeHttpUrl(url)) errors.postPurchase = "Enter a full web address starting with https://.";
      return { type: "url", url };
    }
    case "page": {
      const pageId = str(d.pageId, 64);
      if (!ID_RE.test(pageId)) errors.postPurchase = "Choose a page.";
      return { type: "page", pageId };
    }
    case "funnel_next_step":
      if (contextType !== "funnel_step") errors.postPurchase = "Only funnel checkouts can continue to a funnel step.";
      return { type: "funnel_next_step" };
    case "funnel_step": {
      const stepId = str(d.stepId, 64);
      if (contextType !== "funnel_step") errors.postPurchase = "Only funnel checkouts can continue to a funnel step.";
      else if (!ID_RE.test(stepId)) errors.postPurchase = "Choose a funnel step.";
      return { type: "funnel_step", stepId };
    }
    default:
      return { type: "space" };
  }
}

function sanitizeBumps(raw: unknown, previous: CheckoutBump[], newId: () => string): CheckoutBump[] {
  if (!Array.isArray(raw)) return [];
  const prevIds = new Set(previous.map((b) => b.id));
  return raw.slice(0, 50).map((item) => {
    const b = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
    const givenId = str(b.id, 64);
    const imageUrl = str(b.imageUrl, 2000);
    return {
      // Keep an existing bump's id; anything else gets a fresh server id.
      id: givenId && prevIds.has(givenId) ? givenId : newId(),
      offerId: str(b.offerId, 64),
      enabled: bool(b.enabled, true),
      headline: str(b.headline, 120),
      description: str(b.description, 400),
      imageUrl: isSafeHttpUrl(imageUrl) ? imageUrl : "",
      badge: str(b.badge, 30),
      checkboxLabel: str(b.checkboxLabel, 80),
    };
  });
}

/**
 * Sanitise an editor payload into config fields. Returns field errors for
 * anything that can be judged without loading Offers.
 */
export function sanitizeCheckoutInput(
  raw: unknown,
  previous: EditableCheckoutFields,
  contextType: CheckoutConfig["context"]["type"],
  newId: () => string,
): { value: EditableCheckoutFields; errors: Record<string, string> } {
  const b = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const errors: Record<string, string> = {};
  const agreementRaw = (b.agreement && typeof b.agreement === "object" ? b.agreement : {}) as Record<string, unknown>;
  const mode = agreementRaw.mode === "required" || agreementRaw.mode === "custom" ? agreementRaw.mode : "notRequired";
  const customText = str(agreementRaw.customText, 600) || DEFAULT_SERVICE_AGREEMENT_TEXT;
  const linkUrl = str(agreementRaw.linkUrl, 2000);
  if (linkUrl && !isSafeHttpUrl(linkUrl)) errors.agreement = "The agreement link must start with https://.";
  const d = (b.display && typeof b.display === "object" ? b.display : {}) as Record<string, unknown>;
  const base = previous.display;
  const primaryOfferId = contextType === "hosted_offer" ? previous.primaryOfferId : str(b.primaryOfferId, 64) || null;
  if (primaryOfferId && !ID_RE.test(primaryOfferId)) errors.primaryOfferId = "Choose an Offer.";
  return {
    errors,
    value: {
      primaryOfferId,
      enabled: bool(b.enabled, previous.enabled),
      format: b.format === "two_step" ? "two_step" : "one_step",
      nameFormat: b.nameFormat === "first_last" ? "first_last" : "full",
      phone: b.phone === "optional" || b.phone === "required" ? b.phone : "hidden",
      billingAddress: b.billingAddress === "full" ? "full" : "auto",
      agreement: { mode, customText, linkUrl: linkUrl && isSafeHttpUrl(linkUrl) ? linkUrl : "" },
      couponsEnabled: bool(b.couponsEnabled, previous.couponsEnabled),
      bumps: sanitizeBumps(b.bumps, previous.bumps, newId),
      display: {
        headline: typeof d.headline === "string" ? str(d.headline, 120) : base.headline,
        subheadline: typeof d.subheadline === "string" ? str(d.subheadline, 300) : base.subheadline,
        showRecurringTerms: bool(d.showRecurringTerms, base.showRecurringTerms),
        showTrialTiming: bool(d.showTrialTiming, base.showTrialTiming),
        showDueToday: bool(d.showDueToday, base.showDueToday),
        showEntitlements: bool(d.showEntitlements, base.showEntitlements),
        guaranteeEnabled: bool(d.guaranteeEnabled, base.guaranteeEnabled),
        guaranteeTitle: typeof d.guaranteeTitle === "string" ? str(d.guaranteeTitle, 80) : base.guaranteeTitle,
        guaranteeText: typeof d.guaranteeText === "string" ? str(d.guaranteeText, 400) : base.guaranteeText,
        showSecureBadge: bool(d.showSecureBadge, base.showSecureBadge),
        submitLabel: typeof d.submitLabel === "string" ? str(d.submitLabel, 40) : base.submitLabel,
      },
      postPurchase: sanitizeDestination(b.postPurchase ?? previous.postPurchase, contextType, errors),
      internalNotes: typeof b.internalNotes === "string" ? str(b.internalNotes, 500) : previous.internalNotes,
    },
  };
}

type OfferFacts = Pick<CourseOffer, "id" | "type" | "priceCents" | "currency" | "visibility" | "subAccountId"> & {
  systemManaged?: boolean;
};

/** Why an Offer can't be the primary Offer of a checkout, or null when it can. */
export function primaryOfferProblem(offer: OfferFacts | null, subAccountId: string): string | null {
  if (!offer || offer.subAccountId !== subAccountId) return "That Offer isn't in this workspace.";
  if (offer.systemManaged) return "Community pricing Offers are managed by the Community and can't be sold here.";
  if (offer.visibility === "archived") return "That Offer is archived.";
  return null;
}

/** Why an Offer can't be ATTACHED as a new Order Bump, or null when it can. */
export function bumpOfferProblem(offer: OfferFacts | null, primary: OfferFacts | null, subAccountId: string): string | null {
  if (!offer || offer.subAccountId !== subAccountId) return "That Offer isn't in this workspace.";
  if (primary && offer.id === primary.id) return "The primary Offer can't also be an Order Bump.";
  if (offer.systemManaged) return "Community pricing Offers can't be Order Bumps.";
  if (offer.visibility !== "published") return "Only published Offers can be Order Bumps.";
  if (offer.type === "recurring") return "Order Bumps must be one-time Offers.";
  if (offer.type === "free" || !offer.priceCents) return "Order Bumps must be paid one-time Offers.";
  const cur = (offer.currency ?? "USD").toUpperCase();
  if (primary && (primary.currency ?? "USD").toUpperCase() !== cur) return "Order Bumps must use the same currency as the primary Offer.";
  return null;
}

/**
 * Validate a bump list against loaded Offers. A bump that was ALREADY saved
 * and whose Offer later became archived/unpublished is kept (so it isn't
 * silently lost) but must be disabled; new bumps must pass every rule.
 */
export function validateBumps(
  bumps: CheckoutBump[],
  previous: CheckoutBump[],
  offers: Map<string, OfferFacts>,
  primary: OfferFacts | null,
  subAccountId: string,
): Record<string, string> {
  const errors: Record<string, string> = {};
  if (bumps.length > MAX_ORDER_BUMPS) errors.bumps = `A checkout can have up to ${MAX_ORDER_BUMPS} Order Bumps.`;
  const seen = new Set<string>();
  const previousOffers = new Set(previous.map((b) => b.offerId));
  bumps.forEach((b, i) => {
    const key = `bumps.${i}`;
    if (!ID_RE.test(b.offerId)) {
      errors[key] = "Choose an Offer for this Order Bump.";
      return;
    }
    if (seen.has(b.offerId)) {
      errors[key] = "That Offer is already an Order Bump on this checkout.";
      return;
    }
    seen.add(b.offerId);
    const problem = bumpOfferProblem(offers.get(b.offerId) ?? null, primary, subAccountId);
    if (!problem) return;
    const keptLegacy = previousOffers.has(b.offerId) && !b.enabled && offers.get(b.offerId)?.subAccountId === subAccountId;
    if (!keptLegacy) errors[key] = problem;
  });
  return errors;
}

/** Bumps a buyer can actually see right now (enabled + still eligible). */
export function liveBumps(
  bumps: CheckoutBump[],
  offers: Map<string, OfferFacts>,
  primary: OfferFacts | null,
  subAccountId: string,
): CheckoutBump[] {
  return bumps.filter((b) => b.enabled && !bumpOfferProblem(offers.get(b.offerId) ?? null, primary, subAccountId));
}
