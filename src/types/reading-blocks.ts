import type { ChartDesign } from "@/types/chart-design";
import type { EnergeticDecoderReading } from "@/types/energetic-decoder";

/**
 * Reading blocks (2026-10-21) — the shared, Reading-aware building blocks
 * behind EVERY way a person sees their Reading right after a Reading Tool
 * submission: the built-in Standard Result and a creator's own Reading
 * Result Page (Pages & Funnels). One Centers renderer, one At-a-Glance
 * renderer, one Gates renderer… so a fix lands everywhere at once.
 *
 * A block never chooses colors (those come from the Chart Design) and never
 * chooses wording (that comes from the Content Set saved INTO the Reading
 * when it was created). Blocks only decide what to show and how to lay it out.
 */

/** Builder sample charts — fictional, deterministic, never saved anywhere. */
export type ReadingSampleKind =
  | "projector"
  | "generator"
  | "manifestingGenerator"
  | "manifestor"
  | "reflector"
  | "latestTest";

export const READING_SAMPLE_LABEL: Record<ReadingSampleKind, string> = {
  projector: "Projector sample",
  generator: "Generator sample",
  manifestingGenerator: "Manifesting Generator sample",
  manifestor: "Manifestor sample",
  reflector: "Reflector sample",
  latestTest: "Your latest Test Reading",
};

export const READING_SAMPLE_KINDS: ReadingSampleKind[] = [
  "projector",
  "generator",
  "manifestingGenerator",
  "manifestor",
  "reflector",
  "latestTest",
];

export type FeaturedOfferLayout = "card" | "banner" | "sideBySide";

/**
 * Everything a Featured Offer block may show, resolved server-side from the
 * real Offer. Price, billing terms, what it grants and where checkout lives
 * are AUTHORITATIVE — a page can restyle the presentation but can never
 * change what the visitor is promised.
 */
export interface FeaturedOfferPayload {
  offerId: string;
  title: string;
  /** Plain-text summary of the Offer's own description (≤ 280 chars). */
  summary: string;
  thumbnailUrl: string | null;
  /** e.g. "$97", "$29 / month", "Free" — the same label the checkout shows. */
  priceLabel: string;
  /** e.g. "Renews every month · 7-day free trial", or null for one-time/free. */
  billingNote: string | null;
  /** What buying it grants, from the Offer itself ("Course: …", "3 sessions: …"). */
  grants: string[];
  /** The Offer's real checkout page. */
  href: string;
  published: boolean;
}

/** The creator's presentation choices for a Featured Offer (never price/terms). */
export interface FeaturedOfferPresentation {
  headline: string;
  body: string;
  ctaLabel: string;
  imageUrl: string;
  badge: string;
  layout: FeaturedOfferLayout;
}

export type ReadingBlockMode = "live" | "test" | "preview" | "sample";

/**
 * What the visitor can do next with THIS Reading. Every href here was built
 * server-side for this exact Reading and visitor — a block never builds an
 * access link of its own.
 */
export interface ReadingBlockAccess {
  /** PDF download (null when the Reading Tool turned PDFs off, or in samples). */
  pdfHref: string | null;
  /** The Reading Report page — only offered when MyMagnetix is not the permanent home. */
  reportHref: string | null;
  /** Save to MyMagnetix was on for this Reading. */
  myMagnetix: {
    /** POST here to open or email the MyMagnetix sign-in for this Reading. */
    actionUrl: string | null;
    /** Where the Reading lives in MyMagnetix once signed in. */
    openUrl: string;
    /** e.g. "q•••@gmail.com" — so "check your email" is concrete. */
    maskedEmail: string | null;
  } | null;
}

export interface ReadingBlockContext {
  subAccountId: string;
  reading: EnergeticDecoderReading;
  designs: {
    hdDesign: ChartDesign | null;
    mandalaDesign: ChartDesign | null;
    astroDesign: ChartDesign | null;
  };
  accent: string;
  mode: ReadingBlockMode;
  access: ReadingBlockAccess;
  /** Featured Offers placed on this result, resolved from the real Offers. */
  offers: Record<string, FeaturedOfferPayload | null>;
  /** Shown above the sample in the builder ("Projector sample"), else null. */
  sampleLabel: string | null;
}

/** Page-level defaults for a Reading Result Page (Pages & Funnels). */
export interface ReadingResultPageSettings {
  /** Chart Design for every Reading block; null = the Reading Tool's, then the business default. */
  chartDesignSetId: string | null;
  /** Which sample chart the builder shows. */
  sample: ReadingSampleKind;
}

export const DEFAULT_READING_RESULT_PAGE_SETTINGS: ReadingResultPageSettings = {
  chartDesignSetId: null,
  sample: "projector",
};
