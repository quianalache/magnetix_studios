import type { Timestamp, FieldValue } from "firebase/firestore";

/**
 * Business Brain — the shared, sub-account-level strategic context layer.
 *
 * Originally built as YouTube Content Studio's "Channel Brain" (see
 * docs/product/youtube-content-studio-migration-spec.md §4), then promoted
 * to a sub-account-owned domain because none of its 8 sections are
 * actually YouTube-specific — they're the creator's audience, voice,
 * offers, frameworks, stories, topics, and positioning, useful to every
 * current and future AI-assisted content feature (YouTube Content Studio,
 * Content Alchemy Lab, Social Planner AI, email AI, sales copy tools).
 *
 * Field names and shapes here are taken verbatim from the real, already-
 * migrated data (Phase 0 of the YTCS migration) — nothing here is
 * invented or simplified from that source. See the migration spec's §4
 * for the full field-level provenance of every section below.
 */

export interface BusinessBrainVision {
  statement?: string;
  knownFor?: string;
  feelRealize?: string;
  believe?: string;
  against?: string;
  transformation?: string;
  different?: string;
  returnTo?: string;
}

export interface BusinessBrainAudience {
  help?: string;
  struggling?: string;
  want?: string;
  understandBeforeTrust?: string;
  tired?: string;
  wrong?: string;
  identity?: string;
  objections?: string;
  unaware?: string;
  problemAware?: string;
  solutionAware?: string;
  productAware?: string;
  mostAware?: string;
}

export interface BusinessBrainOffer {
  id: string;
  name?: string;
  price?: string;
  who?: string;
  transformation?: string;
  problem?: string;
  when?: string;
  /** Best-fit viewer awareness stage — free text, not a strict enum in
   *  the real data (e.g. "Problem Aware", "Not Sure"). */
  viewerStage?: string;
  link?: string | null;
  notes?: string;
}

/** The 12 real Framework Type values — migration spec §4.4. */
export type BusinessBrainFrameworkType =
  | "Signature Method"
  | "Teaching Framework"
  | "Content Framework"
  | "Client Process"
  | "Step-by-Step Method"
  | "Decision-Making Framework"
  | "Mindset Framework"
  | "Offer Framework"
  | "Messaging Framework"
  | "Visibility Framework"
  | "Creative Process"
  | "Other"
  | (string & {});

export interface BusinessBrainFramework {
  id: string;
  name?: string;
  type?: BusinessBrainFrameworkType;
  helpDo?: string;
  who?: string;
  steps?: string;
  different?: string;
  misunderstand?: string;
  transformation?: string;
  when?: string;
  relatedOffer?: string;
  /** Legacy field name (pre Topics rename) — see migration spec §4.4. */
  relatedPillar?: string;
  ideas?: string;
  notes?: string;
}

export interface BusinessBrainStory {
  id: string;
  name?: string;
  /** Real data stores a lowercase slug (e.g. "identity"). */
  type?: string;
  problem?: string;
  pursuit?: string;
  payoff?: string;
  lesson?: string;
  rawTranscript?: string;
  /** Removed from the UI but preserved when the source data ever had a
   *  real value — migration spec §4.5. Absent when never populated. */
  legacy?: {
    useful?: string;
    relatedOffer?: string;
    relatedPillar?: string;
  };
}

export interface BusinessBrainVoice {
  sound?: string;
  wordsOften?: string;
  wordsAvoid?: string;
  feelLikeYou?: string;
  tone?: string;
  rules?: string;
}

export interface BusinessBrainTopic {
  id: string;
  name?: string;
  means?: string;
  why?: string;
  relatedOffer?: string;
  notes?: string;
}

export interface BusinessBrainSubtopic {
  id: string;
  name?: string;
  parentTopic?: string;
  covers?: string;
  questions?: string;
  relatedOffer?: string;
  notes?: string;
}

export interface BusinessBrainPositioning {
  /** Positioning Element slugs — see migration spec §4.8 for the full
   *  slug <-> "The X Element™" name/definition table. */
  mostUsed?: string[];
  practiceMore?: string[];
  notFit?: string[];
  notes?: string;
}

/**
 * Legacy Channel-Brain-era top-level sections, superseded in place
 * (Signature Method -> Frameworks, Content Pillars -> Topics/Subtopics —
 * migration spec §4.4/§4.7) but preserved verbatim, never surfaced by any
 * UI, never treated as an active editable source.
 */
export interface BusinessBrainLegacy {
  method?: {
    haveMethod?: string;
    steps?: string;
    different?: string;
    misunderstand?: string;
    helpDo?: string;
  };
  pillars?: Array<{
    id: string;
    name?: string;
    means?: string;
    belong?: string;
    notBelong?: string;
    connects?: string;
    ideas?: string;
  }>;
}

/**
 * The full Business Brain document — one per sub-account, at
 * `subAccounts/{subAccountId}/businessBrain/main`.
 */
export interface BusinessBrain {
  vision?: BusinessBrainVision;
  audience?: BusinessBrainAudience;
  offers?: BusinessBrainOffer[];
  frameworks?: BusinessBrainFramework[];
  stories?: BusinessBrainStory[];
  voice?: BusinessBrainVoice;
  topics?: BusinessBrainTopic[];
  subtopics?: BusinessBrainSubtopic[];
  positioning?: BusinessBrainPositioning;

  /** Superseded Channel-Brain-era sections — see BusinessBrainLegacy. */
  legacy?: BusinessBrainLegacy;
  /** Anything found on the source doc that didn't match a known section —
   *  never silently dropped during migration. Absent when empty. */
  unknownFields?: Record<string, unknown>;

  /** Provenance: this document's data originated from the YTCS export
   *  import (Phase 0), then moved to this canonical shared location. */
  migratedFromExport?: string;
  migratedAt?: Timestamp | FieldValue | string;
  movedFromYtcsBrain?: boolean;
  movedFromYtcsBrainAt?: Timestamp | FieldValue | string;
}

/** Canonical Firestore path segments for a sub-account's Business Brain. */
export const BUSINESS_BRAIN_COLLECTION = "businessBrain";
export const BUSINESS_BRAIN_DOC_ID = "main";

export function businessBrainDocPath(subAccountId: string): string {
  return `subAccounts/${subAccountId}/${BUSINESS_BRAIN_COLLECTION}/${BUSINESS_BRAIN_DOC_ID}`;
}
