/**
 * Checkout PRESENTATION (Checkout Foundation Phase 3) — what the Page
 * Builder Checkout / Order Form block controls. Pure + client-safe.
 *
 * The block owns placement, layout, typography, spacing and which OPTIONAL
 * pieces are visually shown. It never owns — and can't change — price,
 * currency, billing, trial, which Offer or Order Bumps are sold, coupon
 * acceptance, fulfilment or totals: those come from the connected Checkout
 * Step's configuration and the server.
 *
 * Business configuration always wins: a toggle can only HIDE an optional
 * piece the checkout already offers; it can never switch on a coupon field
 * the checkout doesn't accept or an Order Bump that isn't configured. And
 * nothing here can hide required disclosures — the amount due today,
 * recurring/trial terms, selected add-on prices, a coupon's effect, the
 * payment fields, the agreement or the purchase button.
 */
import type { CheckoutView } from "@/lib/checkout/view-types";

export type CheckoutPreset = "full" | "minimal";
export type CheckoutLayout = "auto" | "two_column" | "single_column";
export type CheckoutWidth = "full" | "wide" | "narrow";
export type CheckoutBumpStyle = "card" | "outlined" | "highlight";

export interface CheckoutShow {
  /** Brand logo + "Secure checkout" bar at the top of the block. */
  header: boolean;
  heading: boolean;
  subheading: boolean;
  offerImage: boolean;
  offerDescription: boolean;
  benefits: boolean;
  /** Full itemised summary. Off = a concise summary that still lists every price. */
  orderSummary: boolean;
  /** Two-step: also show the summary on Step 1. */
  summaryOnStep1: boolean;
  couponField: boolean;
  bumps: boolean;
  guarantee: boolean;
  /** Secure-payment reassurance line + "What happens next" card. */
  trust: boolean;
  progress: boolean;
}

export interface CheckoutText {
  heading: string;
  subheading: string;
  step1Title: string;
  step2Title: string;
  continueLabel: string;
  /** Overrides the CTA label; the amount/trial wording is added automatically. */
  submitLabel: string;
}

export interface CheckoutPresentation {
  preset: CheckoutPreset;
  layout: CheckoutLayout;
  width: CheckoutWidth;
  alignment: "left" | "center";
  container: "card" | "plain";
  summaryPosition: "right" | "left";
  /** Phones: where the order summary sits in the stacked layout. */
  mobileSummary: "top" | "bottom";
  bumpStyle: CheckoutBumpStyle;
  showBumpImages: boolean;
  showBumpDescriptions: boolean;
  bumpPlacement: "before_payment" | "after_payment";
  couponPlacement: "summary" | "before_payment";
  buttonWidth: "full" | "auto";
  buttonAlign: "left" | "center";
  show: CheckoutShow;
  text: CheckoutText;
}

const FULL_SHOW: CheckoutShow = {
  header: true,
  heading: true,
  subheading: true,
  offerImage: true,
  offerDescription: true,
  benefits: true,
  orderSummary: true,
  summaryOnStep1: true,
  couponField: true,
  bumps: true,
  guarantee: true,
  trust: true,
  progress: true,
};

const MINIMAL_SHOW: CheckoutShow = {
  header: false,
  heading: true,
  subheading: false,
  offerImage: false,
  offerDescription: false,
  benefits: false,
  orderSummary: false,
  summaryOnStep1: false,
  couponField: true,
  bumps: true,
  guarantee: false,
  trust: false,
  progress: true,
};

export const EMPTY_CHECKOUT_TEXT: CheckoutText = { heading: "", subheading: "", step1Title: "", step2Title: "", continueLabel: "", submitLabel: "" };

export const DEFAULT_CHECKOUT_PRESENTATION: CheckoutPresentation = {
  preset: "full",
  layout: "auto",
  width: "wide",
  alignment: "center",
  container: "plain",
  summaryPosition: "right",
  mobileSummary: "bottom",
  bumpStyle: "card",
  showBumpImages: true,
  showBumpDescriptions: true,
  bumpPlacement: "before_payment",
  couponPlacement: "summary",
  buttonWidth: "full",
  buttonAlign: "center",
  show: FULL_SHOW,
  text: EMPTY_CHECKOUT_TEXT,
};

/**
 * Apply a preset. Reversible and editable: it only sets the layout and the
 * optional-piece toggles (every one of which can be changed afterwards);
 * text overrides and styling are kept.
 */
export function applyPreset(p: CheckoutPresentation, preset: CheckoutPreset): CheckoutPresentation {
  return preset === "minimal"
    ? { ...p, preset, layout: "single_column", width: "narrow", container: "card", show: { ...MINIMAL_SHOW } }
    : { ...p, preset, layout: "auto", width: "wide", container: "plain", show: { ...FULL_SHOW } };
}

const pick = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T => (allowed.includes(v as T) ? (v as T) : fallback);
const bool = (v: unknown, fallback: boolean) => (typeof v === "boolean" ? v : fallback);
// Not trimmed here: the builder's inputs round-trip through this while the
// creator types. Rendering trims (see trimmedText).
const text = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/[\r\n\t]+/g, " ").slice(0, max) : "");

/** Text overrides as rendered (surrounding spaces dropped). */
export function trimmedText(t: CheckoutText): CheckoutText {
  return Object.fromEntries(Object.entries(t).map(([k, v]) => [k, v.trim()])) as unknown as CheckoutText;
}

/** Read stored block props leniently (older / partial / hand-edited data). */
export function normalizePresentation(raw: unknown): CheckoutPresentation {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const preset = pick(r.preset, ["full", "minimal"] as const, "full");
  const base = preset === "minimal" ? applyPreset(DEFAULT_CHECKOUT_PRESENTATION, "minimal") : DEFAULT_CHECKOUT_PRESENTATION;
  const s = (r.show && typeof r.show === "object" ? r.show : {}) as Record<string, unknown>;
  const t = (r.text && typeof r.text === "object" ? r.text : {}) as Record<string, unknown>;
  const show = Object.fromEntries((Object.keys(FULL_SHOW) as (keyof CheckoutShow)[]).map((k) => [k, bool(s[k], base.show[k])])) as unknown as CheckoutShow;
  return {
    preset,
    layout: pick(r.layout, ["auto", "two_column", "single_column"] as const, base.layout),
    width: pick(r.width, ["full", "wide", "narrow"] as const, base.width),
    alignment: pick(r.alignment, ["left", "center"] as const, base.alignment),
    container: pick(r.container, ["card", "plain"] as const, base.container),
    summaryPosition: pick(r.summaryPosition, ["right", "left"] as const, base.summaryPosition),
    mobileSummary: pick(r.mobileSummary, ["top", "bottom"] as const, base.mobileSummary),
    bumpStyle: pick(r.bumpStyle, ["card", "outlined", "highlight"] as const, base.bumpStyle),
    showBumpImages: bool(r.showBumpImages, base.showBumpImages),
    showBumpDescriptions: bool(r.showBumpDescriptions, base.showBumpDescriptions),
    bumpPlacement: pick(r.bumpPlacement, ["before_payment", "after_payment"] as const, base.bumpPlacement),
    couponPlacement: pick(r.couponPlacement, ["summary", "before_payment"] as const, base.couponPlacement),
    buttonWidth: pick(r.buttonWidth, ["full", "auto"] as const, base.buttonWidth),
    buttonAlign: pick(r.buttonAlign, ["left", "center"] as const, base.buttonAlign),
    show,
    text: {
      heading: text(t.heading, 120),
      subheading: text(t.subheading, 300),
      step1Title: text(t.step1Title, 60),
      step2Title: text(t.step2Title, 60),
      continueLabel: text(t.continueLabel, 40),
      submitLabel: text(t.submitLabel, 40),
    },
  };
}

/** What actually renders: presentation ∩ what the checkout offers. */
export interface EffectiveCheckoutShow extends CheckoutShow {
  marketingOptIn: boolean;
}

export function effectiveShow(p: CheckoutPresentation, view: Pick<CheckoutView, "couponsEnabled" | "bumps" | "display" | "primary" | "format" | "crm">): EffectiveCheckoutShow {
  const s = p.show;
  return {
    ...s,
    // Business config wins — a block can hide these, never invent them.
    couponField: s.couponField && view.couponsEnabled,
    bumps: s.bumps && view.bumps.length > 0,
    guarantee: s.guarantee && view.display.guaranteeEnabled && !!(view.display.guaranteeTitle || view.display.guaranteeText),
    benefits: s.benefits && view.display.showEntitlements && view.primary.entitlements.length > 0,
    offerImage: s.offerImage && !!view.primary.thumbnailUrl,
    offerDescription: s.offerDescription && !!view.primary.description,
    progress: s.progress && view.format === "two_step",
    summaryOnStep1: s.summaryOnStep1 && view.format === "two_step",
    // Not a presentation toggle: the opt-in box shows exactly when the
    // checkout's CRM settings turn it on.
    marketingOptIn: !!view.crm?.marketingOptIn,
  };
}

/** Builder labels for the "Connected to" card. */
export function connectionLabel(c: { funnelName: string; stepName: string }): string {
  return `${c.stepName || "Checkout"} — ${c.funnelName || "Untitled funnel"}`;
}
