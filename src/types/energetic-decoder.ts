import type { Timestamp, FieldValue } from "firebase/firestore";
import type { GeneKeysSphereResult } from "@/lib/energetics/gene-keys";
import type { HumanDesignProfile } from "@/lib/energetics/human-design";
import type { AstrologyChart } from "@/lib/energetics/astrology";

/**
 * "Energetic Decoder" — the Memberships-tab home for chart-reading
 * products (Gene Keys today; Human Design and astrology are planned
 * later phases sharing the same birth-data foundation). Deliberately
 * system-agnostic naming since a sub-account picks which system(s) they
 * offer, not us.
 *
 * Structured after researching bodygraph.com (2026-08-05, at her request):
 * its "dashboard" is a practitioner business tool (saved client charts,
 * chart design/branding, embeddable lead-capture tool), not a personal
 * dashboard for whoever gets a reading — the end customer just gets a
 * one-time chart, no login. She explicitly wants a sales-stats dashboard
 * skipped, saved client charts linked on the Contact profile, a chart
 * design tool, and the embeddable tool.
 */

export interface EnergeticDecoderRequest {
  name: string;
  /** Required — this is what links the reading to a Contact record. */
  email: string;
  /** YYYY-MM-DD. */
  birthDate: string;
  /** HH:MM, 24-hour. */
  birthTime: string;
  /** Free-text place. Geocoded server-side UNLESS lat/lng/timeZone below
   *  are already present (the visitor picked a specific autocomplete
   *  suggestion, so this is just the display label at that point). */
  birthPlace: string;
  /** Pre-resolved from the autocomplete dropdown — skips server-side
   *  geocoding and guarantees the calculation uses exactly the place the
   *  visitor picked, not a possibly-different best-guess re-geocode of
   *  the raw text. */
  lat?: number;
  lng?: number;
  timeZone?: string;
}

export interface EnergeticDecoderResult {
  name: string;
  birthPlace: string;
  timeZone: string;
  spheres: GeneKeysSphereResult[];
}

/**
 * The sub-account's own wording (or the shipped default, if they never
 * rewrote it) at the moment this reading was generated — same snapshot
 * principle as Gene Keys' `spheresWithContent`: a reading is a saved
 * client chart as of when it was created, so a later content rewrite
 * doesn't retroactively change readings already delivered. Resolved via
 * energetic-decoder-chart-content-service.ts.
 */
export interface HumanDesignReadingContent {
  typeStrategy: string;
  typeDescription: string;
  authorityDescription: string;
  /** Keyed by CenterKey. All 9 resolved regardless of definition status, so the reading always has both texts available to display. */
  centers: Record<string, { definedText: string; undefinedText: string }>;
}

export interface AstrologyReadingContent {
  /** Keyed by ZodiacSign. */
  signs: Record<string, string>;
  /** Keyed by house number (as string). */
  houses: Record<string, { theme: string; description: string }>;
  /** Keyed by AspectType. */
  aspectTypes: Record<string, string>;
}

/**
 * A saved reading — `subAccounts/{saId}/energeticDecoderReadings/{id}` in
 * spirit, but stored as a flat top-level collection with subAccountId/
 * agencyId fields (matching `forms`/`contacts`), since listing "every
 * reading for this contact" and "every reading for this sub-account" are
 * both flat queries, not nested-under-one-parent lookups.
 */
export interface EnergeticDecoderReading {
  id: string;
  subAccountId: string;
  agencyId: string;
  contactId: string;
  /** Legacy discriminator — kept for existing docs; a reading can now hold both systems at once (see `spheres`/`humanDesign` below), so this is no longer exhaustive. */
  system: "geneKeys";
  name: string;
  birthDate: string;
  birthTime: string;
  birthPlace: string;
  timeZone: string;
  /** Empty when Gene Keys wasn't included in this reading (report config). */
  spheres: GeneKeysSphereResult[];
  /** Null when Human Design wasn't included in this reading (report config), or on readings created before this system existed. `content` itself is optional within this for the same reason — readings saved before the chart-content snapshot shipped (2026-08-08) have the calculated profile but no snapshotted wording; display code falls back to the hardcoded defaults for those. */
  humanDesign?: (HumanDesignProfile & { content?: HumanDesignReadingContent }) | null;
  /** Same as `humanDesign` above. */
  astrology?: (AstrologyChart & { content?: AstrologyReadingContent }) | null;
  createdAt: Timestamp | FieldValue | null;
}

/**
 * Chart/report design — accent color + logo, applied to the public
 * embeddable tool and the PDF report. One per sub-account, stored on the
 * sub-account doc itself (`energeticDecoderTheme`) — same shape
 * convention as `FormAppearance`, just not per-instance since a
 * practitioner has one brand, not one per reading.
 *
 * `chartDefinedColor` — Phase 4 (2026-08-09), the "fast-follow" flagged
 * 2026-08-08 when the drawn bodygraph first shipped: which color a
 * DEFINED center fills with. Deliberately the only customizable part of
 * the chart — undefined stays white and Personality/Design stay
 * black/red, both near-universal conventions across every real Human
 * Design tool, not brand choices the way a defined-center color is.
 */
export interface EnergeticDecoderTheme {
  accent: string;
  logoUrl: string | null;
  chartDefinedColor: string;
}

export function defaultEnergeticDecoderTheme(): EnergeticDecoderTheme {
  return { accent: "#7c3aed", logoUrl: null, chartDefinedColor: "#d4d4d8" };
}

/**
 * Which Gene Keys sequences a sub-account's reading actually includes —
 * the Reports tab's sequence checkboxes. All on by default. Stored on the
 * sub-account doc (`energeticDecoderReportConfig`), same one-per-
 * sub-account convention as the theme above.
 */
export interface EnergeticDecoderReportConfig {
  includeActivation: boolean;
  includeVenus: boolean;
  includePearl: boolean;
  /** Compute + store a full Human Design bodygraph (Type/Authority/Profile/Centers/Channels) alongside Gene Keys for every new reading. */
  includeHumanDesign: boolean;
  /** Compute + store a full Western Tropical natal chart (placements/houses/aspects) alongside the others. Requires the birth place to have real coordinates (geocoded), not just a timezone. */
  includeAstrology: boolean;
}

export function defaultEnergeticDecoderReportConfig(): EnergeticDecoderReportConfig {
  return {
    includeActivation: true,
    includeVenus: true,
    includePearl: true,
    includeHumanDesign: true,
    includeAstrology: true,
  };
}

/**
 * Sphere → sequence membership, used to filter a reading's spheres by the
 * report config above (Set-membership only today, so this constant's own
 * order was never functionally load-bearing), and as the per-sequence
 * building blocks of the real canonical sphere order (see
 * GENE_KEYS_CANONICAL_SPHERE_ORDER below).
 *
 * PEARL_SEQUENCE_SPHERES order fixed 2026-08-10 — was
 * Vocation/Brand/Culture/Pearl (this file's own original, arbitrary
 * order), found stale while auditing every place sphere order is
 * declared after fixing the same issue in gene-keys.ts's own `raw`
 * array. Verified against genekeys.com's own Pearl Sequence page:
 * "the Vocation, Culture, Brand and Pearl."
 */
export const ACTIVATION_SEQUENCE_SPHERES = ["Life's Work", "Evolution", "Radiance", "Purpose"] as const;
export const VENUS_SEQUENCE_SPHERES = ["Attraction", "IQ", "EQ", "SQ"] as const;
export const PEARL_SEQUENCE_SPHERES = ["Vocation", "Culture", "Brand", "Pearl"] as const;

/**
 * The full 12-sphere canonical Golden Path order — single source of truth
 * for the read-time normalization fallback in energetic-decoder-service.ts
 * (readings saved before the 2026-08-10 Pearl Sequence reorder). Built
 * from the 3 sequence constants above rather than duplicated, so fixing
 * order in one place can't leave the other silently stale again.
 */
export const GENE_KEYS_CANONICAL_SPHERE_ORDER = [
  ...ACTIVATION_SEQUENCE_SPHERES,
  ...VENUS_SEQUENCE_SPHERES,
  ...PEARL_SEQUENCE_SPHERES,
] as const;
