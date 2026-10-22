import type { Timestamp, FieldValue } from "firebase/firestore";
import type { ChartDesign } from "@/types/chart-design";
import type { FeaturedOfferPayload, FeaturedOfferPresentation } from "@/types/reading-blocks";

/**
 * Embeds — the Public Reading Tool's configured experiences (Phase 1,
 * 2026-10-19). Each Embed IS the complete client experience: who can use
 * it, what the form asks, how the Reading is calculated and shown, what
 * happens after submission, and what the CRM does. Pages & Funnels places a
 * saved Embed natively; external websites install it; both render the same
 * configuration. Where a submission came from is captured by Magnetix's
 * existing attribution (URL parameters + the placement context), not by a
 * manual source field.
 *
 * Stored in the flat top-level `embedConfigs` collection. Every field past
 * `placementNote` is optional on disk — `normalizeEmbedConfig`
 * (lib/energetic-decoder/embeds.ts) fills defaults, so a doc saved before
 * Phase 1 reads as a working Draft.
 */

export type EmbedStatus = "draft" | "live" | "archived";

/** Phase 1 ships "anyone". Paid Reading access (Offer entitlement) is Phase 2. */
export type EmbedAccessMode = "anyone";

export type EmbedResultView = "humanDesign" | "mandala" | "astrology";

export type EmbedShowOnPage = "full" | "chartFacts" | "confirmation";

export type EmbedFieldMode = "off" | "optional" | "required";

/**
 * What the consent checkbox means (2026-10-20). "agreement" — the visitor
 * agrees to the owner's wording (e.g. emails about this Reading, terms); it
 * is recorded on the Reading and grants nothing else. "emailMarketing" — the
 * wording asks for permission to send marketing email, so a tick also
 * writes the Contact's existing marketing-email consent (`emailConsent`),
 * exactly like a Form's email-consent field.
 */
export type EmbedConsentPurpose = "agreement" | "emailMarketing";

/** What the visitor receives as their lasting Reading output. Report Design
 *  delivery (an automatically Generated Report) needs secure client access
 *  to Generated Reports and arrives with Phase 2. */
export type EmbedReadingOutput =
  | { kind: "readingReport" }
  | { kind: "reportDesign"; reportDesignId: string };

/**
 * The Standard Result's next step (2026-10-21): nothing, a button, or a
 * Featured Offer card. `myMagnetix` is kept only so older Reading Tools
 * still read — MyMagnetix now has its own primary button whenever "Save to
 * MyMagnetix" is on, so it is no longer offered as a next step.
 */
export type EmbedNextStep =
  | { kind: "none" }
  | { kind: "myMagnetix"; label: string }
  | { kind: "course"; courseId: string; label: string }
  | { kind: "offer"; offerId: string; label: string }
  | { kind: "url"; url: string; label: string }
  | ({ kind: "featuredOffer"; offerId: string } & FeaturedOfferPresentation);

/**
 * Where the visitor goes after submitting (2026-10-21). "standard" — the
 * built-in Standard Result, right where the form was. "customPage" — the
 * whole browser tab moves to a Reading Result Page built in Pages & Funnels.
 */
export type EmbedResultDestination = { kind: "standard" } | { kind: "customPage"; pageId: string };

export interface EmbedFormSettings {
  title: string;
  intro: string;
  buttonLabel: string;
  phone: EmbedFieldMode;
  consent: { enabled: boolean; text: string; purpose: EmbedConsentPurpose };
}

export interface EmbedReadingSettings {
  /** "default" = the Default Content Set (today's text). */
  contentSetId: string;
  /** Unified Chart Design used for every view; null = the sub-account default. */
  chartDesignSetId: string | null;
  /** Which result views are offered, in display order. */
  views: EmbedResultView[];
}

export interface EmbedAfterSubmitSettings {
  /** Standard Result or a custom Reading Result Page. `show`,
   *  `confirmationMessage`, `pdf` and `nextStep` describe the Standard
   *  Result only; `myMagnetix` and `email` are delivery and apply to both. */
  destination: EmbedResultDestination;
  show: EmbedShowOnPage;
  /** Shown with the confirmation (and above the result in the other modes). */
  confirmationMessage: string;
  myMagnetix: boolean;
  output: EmbedReadingOutput;
  pdf: boolean;
  email: boolean;
  nextStep: EmbedNextStep;
}

export interface EmbedContactSettings {
  /** Added to the Contact on every submission; never removes existing tags. */
  tags: string[];
}

export interface EmbedSettings {
  access: { mode: EmbedAccessMode };
  form: EmbedFormSettings;
  reading: EmbedReadingSettings;
  afterSubmit: EmbedAfterSubmitSettings;
  contact: EmbedContactSettings;
}

export interface EmbedStats {
  /** Lifetime, Test records excluded. */
  readings: number;
  /** Lifetime new Contacts created through this Embed, Test excluded. */
  contacts: number;
  lastReadingAt: string | null;
}

export interface EmbedConfig extends EmbedSettings {
  id: string;
  subAccountId: string;
  agencyId: string;
  name: string;
  /** Free-text internal note. Staff-only; never shown to visitors. */
  placementNote: string;
  status: EmbedStatus;
  stats: EmbedStats;
  createdAt: Timestamp | FieldValue | string | null;
  updatedAt: Timestamp | FieldValue | string | null;
}

/**
 * The slice of an Embed a visitor's browser receives — no internal name,
 * note, stats or status. The public page never shows the Embed's name.
 */
export interface PublicEmbedConfig {
  id: string;
  form: EmbedFormSettings;
  views: EmbedResultView[];
  afterSubmit: Pick<EmbedAfterSubmitSettings, "show" | "confirmationMessage" | "myMagnetix" | "pdf" | "email"> & {
    /** "customPage" — the submission response carries the Result Page link. */
    destination: EmbedResultDestination["kind"];
    /** Resolved href for the next-step button, or null. */
    nextStep: { href: string; label: string } | null;
    /** The Standard Result's Featured Offer — the creator's presentation
     *  plus the real Offer (filled in server-side; null when not chosen or
     *  the Offer isn't published). */
    featuredOffer: { presentation: FeaturedOfferPresentation; offer: FeaturedOfferPayload } | null;
  };
}

/** Where a submission was placed — recorded on the Reading. */
export type ReadingPlacement =
  | { kind: "page"; pageId: string }
  | { kind: "external"; host: string | null }
  | { kind: "direct" };

/**
 * Proof of the consent tick, frozen onto the Reading the submission created:
 * who (the Reading's Contact), what (exact wording + purpose), when, where.
 */
export interface ReadingConsentRecord {
  given: true;
  textShown: string;
  purpose: EmbedConsentPurpose;
  consentedAt: string;
  embedId: string;
  /** The page the visitor was on, when known (attribution landing page). */
  sourceUrl: string | null;
}

/** The Embed facts frozen onto a Reading at creation. */
export interface ReadingEmbedSnapshot {
  id: string;
  name: string;
  contentSetId: string;
  chartDesignSetId: string | null;
  views: EmbedResultView[];
  pdf: boolean;
  myMagnetix: boolean;
  /** The Reading Result Page this Reading was sent to, when the Reading
   *  Tool used one (absent on Readings created before 2026-10-21). */
  resultPageId?: string | null;
}

/**
 * Everything a placement (Pages & Funnels block, builder preview) needs to
 * render an Embed: the public config, its status, the business accent and
 * the resolved Chart Designs. Never includes the internal name.
 */
export interface ReadingToolPayload {
  embedId: string;
  status: EmbedStatus;
  embed: PublicEmbedConfig;
  accent: string;
  designs: {
    hdDesign: ChartDesign | null;
    mandalaDesign: ChartDesign | null;
    astroDesign: ChartDesign | null;
  };
}
