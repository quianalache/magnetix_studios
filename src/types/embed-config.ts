import type { Timestamp, FieldValue } from "firebase/firestore";
import type { ChartDesign } from "@/types/chart-design";

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

/** What the visitor receives as their lasting Reading output. Report Design
 *  delivery (an automatically Generated Report) needs secure client access
 *  to Generated Reports and arrives with Phase 2. */
export type EmbedReadingOutput =
  | { kind: "readingReport" }
  | { kind: "reportDesign"; reportDesignId: string };

export type EmbedNextStep =
  | { kind: "none" }
  | { kind: "myMagnetix"; label: string }
  | { kind: "course"; courseId: string; label: string }
  | { kind: "offer"; offerId: string; label: string }
  | { kind: "url"; url: string; label: string };

export interface EmbedFormSettings {
  title: string;
  intro: string;
  buttonLabel: string;
  phone: EmbedFieldMode;
  consent: { enabled: boolean; text: string };
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
    /** Resolved href for the next-step button, or null. */
    nextStep: { href: string; label: string } | null;
  };
}

/** Where a submission was placed — recorded on the Reading. */
export type ReadingPlacement =
  | { kind: "page"; pageId: string }
  | { kind: "external"; host: string | null }
  | { kind: "direct" };

/** The Embed facts frozen onto a Reading at creation. */
export interface ReadingEmbedSnapshot {
  id: string;
  name: string;
  contentSetId: string;
  chartDesignSetId: string | null;
  views: EmbedResultView[];
  pdf: boolean;
  myMagnetix: boolean;
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
