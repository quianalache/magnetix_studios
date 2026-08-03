import type { Timestamp, FieldValue } from "firebase/firestore";
import type { CourseTheme } from "./course-theme";
import type { ContactAttribution } from "./contacts";

/**
 * Course Offers — the commerce/pricing layer on top of Standalone Courses
 * (`src/types/standalone-courses.ts`). A Course is content; an Offer is how
 * it's sold: one Offer can bundle several courses into a single checkout,
 * at one price, with its own access rules. Lives at
 * `subAccounts/{saId}/courseOffers/{offerId}`, a structural sibling of
 * `standaloneCourses`. Mirrors GoHighLevel's Products/Offers split (see the
 * course-offers plan) without renaming our existing Course entity — the
 * unrelated Sales → Products (quotes/invoices) catalog already owns that name.
 */
export type OfferType = "free" | "oneTime" | "recurring";
export type OfferVisibility = "draft" | "published";
export type RecurringInterval = "day" | "week" | "month" | "year";

export interface CourseOfferAccess {
  beginAtSpecificDate: boolean;
  beginDate: Timestamp | FieldValue | null;
  restrictToDays: boolean;
  accessDays: number | null;
}

export interface CourseOfferAdvanced {
  customJs: string;
  customCss: string;
  headerTracking: string;
  footerTracking: string;
}

export type ServiceAgreementMode = "notRequired" | "required" | "custom";

export interface CourseOfferServiceAgreement {
  mode: ServiceAgreementMode;
  /** Shown (and required to be checked) at checkout when `mode === "custom"`. */
  customText: string;
  /** Optional "Link to Service Agreement" URL, shown alongside the checkbox
   *  for both "required" and "custom" modes. */
  linkUrl: string;
}

export interface CourseOfferCheckoutSettings {
  /** Adds a free-form Address field to the checkout form. */
  collectAddress: boolean;
  /** Adds a Phone Number field to the checkout form. Independent of
   *  `serviceAgreement` — this predates it and used to always be collected;
   *  now it's opt-in like GHL's own checkout. */
  collectPhoneNumber: boolean;
  serviceAgreement: CourseOfferServiceAgreement;
}

/**
 * A Booking Page ("Calendar") bundled into an Offer alongside its courses —
 * e.g. "includes 2 calls with that person". `bookingPageName`/`Slug` are
 * snapshotted at attach time so the offer + its purchases can render/link
 * without a join back to the live `BookingPage` doc.
 *
 * `sessionCount` is informational only — tracked and shown to the buyer
 * (email + their post-purchase offer page), not enforced. The public
 * booking form (`/b/{saId}/{slug}`) has no login and no per-purchase credit
 * system, so nothing technically blocks booking more than `sessionCount`
 * times; this is a deliberate scope choice, not an oversight.
 */
export interface CourseOfferBookingBundle {
  bookingPageId: string;
  bookingPageName: string;
  bookingPageSlug: string;
  sessionCount: number;
}

export interface CourseOffer {
  id: string;
  subAccountId: string;
  agencyId: string;
  title: string;
  /** Rich text; used as the checkout description when set. */
  descriptionHtml: string;
  /** Attached Products (courses) — the bundle. At least one required to publish. */
  courseIds: string[];
  type: OfferType;
  /** Cents. Null when `type === "free"`. */
  priceCents: number | null;
  currency: string | null;
  /** Only set when `type === "recurring"`. */
  recurringInterval: RecurringInterval | null;
  /** Days before the first charge — only meaningful when `type ===
   *  "recurring"`. Null/0 = bill immediately. Maps to Stripe Checkout's
   *  `subscription_data.trial_period_days`. */
  trialDays: number | null;
  /** Custom checkout price display, e.g. "Free Trial", "Limited Time Only". */
  priceTextOverride: string | null;
  visibility: OfferVisibility;
  /** Bumped on every save — surfaces as a "Version N" badge. Informational only. */
  version: number;
  thumbnailUrl: string | null;
  /** Maps straight to Stripe Checkout's `allow_promotion_codes` — no
   *  home-grown discount-code system needed. */
  discountCodesEnabled: boolean;
  /** Opt-in social-proof popup on the public checkout page ("Sarah in
   *  Austin just purchased..."). Off by default — showing a customer's
   *  purchase activity publicly is a real choice, not everyone wants it.
   *  Shows first name + city/country only, sourced from the buyer's Member
   *  -> Contact record; never email, phone, or exact address. */
  showRecentPurchasePopup: boolean;
  access: CourseOfferAccess;
  advanced: CourseOfferAdvanced;
  /** Visual theme for the Offer's public checkout page — same system
   *  Standalone Courses use (colors/fonts/header/hero/body/sidebar blocks,
   *  live preview, shared templates). Offers created before this feature
   *  has no such field; every read falls back to `DEFAULT_OFFER_THEME`. */
  theme: CourseTheme;
  /** Checkout-form behavior — separate from `theme` (visual only). Offers
   *  created before this feature have no such field; every read falls back
   *  to `DEFAULT_COURSE_OFFER_CHECKOUT_SETTINGS`. */
  checkoutSettings: CourseOfferCheckoutSettings;
  /** Bundled Booking Page + session count, or null if this offer is
   *  courses-only. See `CourseOfferBookingBundle`. */
  booking: CourseOfferBookingBundle | null;
  createdAt: Timestamp | FieldValue | null;
  updatedAt: Timestamp | FieldValue | null;
}

export const DEFAULT_COURSE_OFFER_ACCESS: CourseOfferAccess = {
  beginAtSpecificDate: false,
  beginDate: null,
  restrictToDays: false,
  accessDays: null,
};

export const DEFAULT_COURSE_OFFER_ADVANCED: CourseOfferAdvanced = {
  customJs: "",
  customCss: "",
  headerTracking: "",
  footerTracking: "",
};

export const DEFAULT_SERVICE_AGREEMENT_TEXT =
  "I have read and agree to the terms and conditions of this page.";

export const DEFAULT_COURSE_OFFER_CHECKOUT_SETTINGS: CourseOfferCheckoutSettings = {
  collectAddress: false,
  collectPhoneNumber: false,
  serviceAgreement: {
    mode: "notRequired",
    customText: DEFAULT_SERVICE_AGREEMENT_TEXT,
    linkUrl: "",
  },
};

/**
 * A purchase of an Offer, at
 * `subAccounts/{saId}/courseOffers/{offerId}/purchases/{purchaseId}`.
 * `courseIds` is snapshotted from the offer at purchase time — later edits
 * to the offer's bundle never retroactively change what a past buyer is
 * entitled to. Mirrors `StandaloneCoursePurchase`'s dual-rail (PayPal
 * manual-reconcile + Stripe instant/webhook) shape.
 */
export type CourseOfferPurchaseStatus = "pending" | "paid" | "canceled" | "void";
export type CourseOfferPurchaseMethod = "paypal" | "stripe";

export interface CourseOfferPurchase {
  id: string;
  subAccountId: string;
  agencyId: string;
  offerId: string;
  courseIds: string[];
  /** Snapshotted from the offer at purchase time, same rationale as
   *  `courseIds` — later edits to the offer's bundle don't retroactively
   *  change what a past buyer was told they got. */
  booking: CourseOfferBookingBundle | null;
  memberId: string;
  amountCents: number;
  currency: string;
  method: CourseOfferPurchaseMethod;
  paypalUrl: string | null;
  stripeCheckoutSessionId: string | null;
  /** Saved so a later One-Click Upsell can charge off-session. */
  stripeCustomerId: string | null;
  /** Only set for `type === "recurring"` offers. */
  stripeSubscriptionId: string | null;
  stripePaymentIntentId: string | null;
  status: CourseOfferPurchaseStatus;
  grantedByUid: string | null;
  requestedAt: Timestamp | FieldValue | null;
  paidAt: Timestamp | FieldValue | null;
  /** UTM/referrer data captured from the offer's checkout page at landing
   *  time — see `normalizeAttribution` in `src/lib/attribution.ts`. Not
   *  threaded into one-click-upsell purchases (the buyer never landed on
   *  that offer's own checkout page), so this is deliberately null there —
   *  used to exclude upsells from conversion counts. */
  attribution?: ContactAttribution | null;
}

/**
 * A post-purchase upsell attached to an Offer, at
 * `subAccounts/{saId}/courseOffers/{offerId}/upsells/{upsellId}`. At most one
 * `"oneClick"` upsell is allowed per offer (enforced in the service layer);
 * `"inApp"` upsells can have several.
 */
export type UpsellType = "oneClick" | "inApp";

export interface CourseOfferUpsell {
  id: string;
  offerId: string;
  type: UpsellType;
  targetOfferId: string;
  visibility: OfferVisibility;
  createdAt: Timestamp | FieldValue | null;
  updatedAt: Timestamp | FieldValue | null;
}
