/**
 * YouTube Content Studio — YTCS-specific data (video projects, saved
 * ideas). Field names are taken verbatim from the real migrated schema
 * documented in docs/product/youtube-content-studio-migration-spec.md
 * §4/§18/§20 — nothing here is invented or simplified from that source.
 *
 * Business Brain (Creator Vision/Audience/Offers/Frameworks/Stories +
 * Proof/Brand Voice/Topics + Subtopics/Positioning) is NOT part of this
 * file — YTCS consumes it via `getBusinessBrain()`, it doesn't own or
 * duplicate it. See @/types/business-brain. The Framework/Offer snapshot
 * fields below reuse those real types directly, since a project's
 * `framework`/`productOfferInput.selectedOfferDetails` genuinely IS a
 * point-in-time copy of a Business Brain record.
 */

import type { BusinessBrainFramework, BusinessBrainOffer } from "@/types/business-brain";
import type { GeneratedTitleOption, GeneratedTitleTopPick } from "@/lib/ytcs/title-generation";

export type YtcsStartingPointType =
  | "brain_dump"
  | "conversation"
  | "short_form"
  | "story"
  | "framework"
  | "productOffer";

export const YTCS_STARTING_POINTS: {
  value: YtcsStartingPointType;
  label: string;
  description: string;
}[] = [
  {
    value: "brain_dump",
    label: "Brain Dump",
    description:
      "Start with a messy idea, random thought, lesson, hot take, or question you want to talk through.",
  },
  {
    value: "conversation",
    label: "Coaching Call / Client Conversation",
    description:
      "Turn a client call, group call, community thread, DM, or audience question into a YouTube video.",
  },
  {
    value: "short_form",
    label: "Short-Form Post",
    description:
      "Expand a Reel, TikTok, Short, caption, email, carousel, or social post into a full YouTube video.",
  },
  {
    value: "story",
    label: "Story Bank",
    description:
      "Build a video around a story, lesson, transformation, client result, mistake, or behind-the-scenes moment.",
  },
  {
    value: "framework",
    label: "Framework",
    description:
      "Start with one of your saved methods, formulas, or teaching models and turn it into a YouTube video.",
  },
  {
    value: "productOffer",
    label: "Product / Offer",
    description:
      "Create a YouTube video from one of your saved offers. Use this when you want to show the product, explain how it helps, build desire, handle objections, or create a stronger sales-focused YouTube video.",
  },
];

export type YtcsVideoStep =
  | "Input"
  | "Deep Dive"
  | "Script Prompt Builder"
  | "Create Video"
  | "Titles"
  | "Publish";

export const YTCS_STEPS: YtcsVideoStep[] = [
  "Input",
  "Deep Dive",
  "Script Prompt Builder",
  "Create Video",
  "Titles",
  "Publish",
];

/** Two final Product/Offer video formats — migration spec §7. Do not
 *  resurrect the rejected "Product Walkthrough" / "Offer Argument" names. */
export type YtcsProductOfferVideoFormat = "productShowcase" | "signatureOfferVideo";

export interface YtcsVoiceNoteRef {
  id: string;
  storagePath: string;
  url?: string;
  mimeType?: string;
  sizeBytes?: number;
  attachedEntityType?: string;
  attachedEntityId?: string;
  locationInApp?: string;
  questionAssociation?: string | null;
  recordingTimestamp?: string | null;
  transcription?: string | null;
  status?: string;
}

export interface YtcsProductOfferInput {
  selectedOfferId?: string;
  selectedOfferName?: string;
  selectedOfferDetails?: BusinessBrainOffer;
  productOfferVideoFormat?: YtcsProductOfferVideoFormat;
}

/**
 * The real Video Project shape — every field name below is a real,
 * confirmed field from the migrated data (spec §4/§18). Legacy/unknown
 * data is preserved but never editable through this type's own fields.
 */
export interface YtcsVideoProject {
  id: string;
  name?: string;
  startingPointType?: YtcsStartingPointType | string;
  currentStep?: YtcsVideoStep | string;
  status?: string;
  rawTranscript?: string;
  scriptMode?: string;
  scriptOutputType?: string;
  depthPreference?: string;

  // Advanced Details — confirmed real, populated 15/15 in the migrated data.
  preferredFormat?: string;
  videoLengthGoal?: string;
  recordingStyle?: string;
  energyStyle?: string;

  deepDiveAnswers?: string;
  generatedDeepDiveQuestions?: string[];
  generatedScriptPrompt?: string;
  compiledScript?: string;
  /** In-app Generate Script (script generation enhancement) — the AI's
   *  generated draft, separate from `compiledScript` (Final Script
   *  Draft) so regeneration never overwrites a user's finished/edited
   *  script. Copied into `compiledScript` only via an explicit "Use as
   *  Final Script Draft" action, never automatically. */
  generatedScript?: string;
  /** Generation metadata for the current `generatedScript` — persisted
   *  (not just held in transient UI state) so a truncation warning
   *  survives a page refresh. Written only by the generate-script
   *  route; never user-editable. */
  generatedScriptMeta?: {
    model: string;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    finishReason?: string;
    truncated: boolean;
    generatedAt: string;
    /** Wall-clock time for the model call itself (ms) — added for cost/
     *  usage visibility (2026-09-03), not shown as a UX feature. */
    durationMs?: number;
    /** OpenRouter's own real, per-call USD cost when the provider
     *  reports one (see openrouter.ts) — preferred over `estimatedCostUsd`
     *  whenever present. */
    providerReportedCostUsd?: number;
    /** Fallback estimate (see script-generation-cost.ts) only when
     *  `providerReportedCostUsd` is unavailable; always paired with the
     *  pricing source/date it was computed from. */
    estimatedCostUsd?: number;
    pricingSource?: string;
    pricingVerifiedDate?: string;
  };
  /** Short-lived lock set by the generate-script route for the duration
   *  of one generation call — the smallest reasonable server-side
   *  guard against two simultaneous generations on the same project
   *  (e.g. a double-submit race the client-side disabled state
   *  missed). Cleared in a `finally` regardless of outcome. */
  generatingScriptSince?: string;
  /** Which `ytcsScriptGenerations` doc the current `generatedScript`
   *  came from (2026-09-09 Script + Titles AI UX pass) — written by
   *  generate-script and by "Use as Current"; lets the UI exclude
   *  whichever generation is already loaded in the active editor from
   *  its "Previous Generations" list without relying on fragile text
   *  comparison. Server-managed only, never user-editable. */
  activeScriptGenerationId?: string;
  generatedTitlePrompt?: string;
  /** In-app Generate Titles (2026-09-09, per-title analysis expanded
   *  2026-09-10) — the current 10-title result. Each entry carries its
   *  own full explanation (why it works / viewer tension / curiosity,
   *  promise, or benefit / why it fits the script) and its own 3
   *  thumbnail ideas — see `GeneratedTitleOption`'s own doc comment.
   *  Replaced wholesale on regenerate; no history is kept (product
   *  decision — titles are cheap/fast to regenerate, unlike scripts).
   *  Server-managed only, never user-editable directly; individual
   *  titles are applied to `selectedTitle`/`backupTitle` via the UI's
   *  "Use as Primary/Backup" actions instead. */
  generatedTitles?: GeneratedTitleOption[];
  /** LEGACY shape (2026-09-09 through 2026-09-10) — the AI's #1-ranked
   *  Top Pick and its explanation as one shared, separate field. No
   *  longer written by a new generation (superseded by per-title
   *  analysis directly on `generatedTitles`) — kept only so the one
   *  real project that already generated titles before 2026-09-10
   *  keeps loading correctly. Nothing reads this field anymore. */
  titleTopPick?: GeneratedTitleTopPick;
  /** LEGACY shape — same situation as `titleTopPick` above: one shared
   *  set of 3 thumbnail ideas for the whole batch, no longer written
   *  (each title now carries its own instead). Preserved read-only. */
  titleThumbnailIdeas?: [string, string, string];
  /** Generation metadata for the current title batch — same shape/
   *  purpose as `generatedScriptMeta` above, minus `truncated` (title
   *  generation's structured-JSON output is validated server-side
   *  before it's ever saved, so a truncated/malformed response is
   *  rejected outright rather than saved with a warning flag). */
  generatedTitlesMeta?: {
    model: string;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    finishReason?: string;
    generatedAt: string;
    durationMs?: number;
    providerReportedCostUsd?: number;
    estimatedCostUsd?: number;
    pricingSource?: string;
    pricingVerifiedDate?: string;
  };
  /** Short-lived lock, same pattern as `generatingScriptSince`. */
  generatingTitlesSince?: string;
  selectedTitle?: string;
  backupTitle?: string;
  /** New in Phase 3B — no real field name was ever found for Titles-step
   *  notes (same situation as `deepDiveVoiceNotes` in Phase 2); follows
   *  the existing `[step]Notes` naming convention. */
  titleNotes?: string;
  finalTitle?: string;
  createVideoStatus?: string;
  recordingChecklist?: Record<string, boolean>;
  editingChecklist?: Record<string, boolean>;
  /** New in Phase 3B — no real field name was ever found for an Upload
   *  Checklist; follows the existing `[step]Checklist` naming
   *  convention (`recordingChecklist`/`editingChecklist`). */
  uploadChecklist?: Record<string, boolean>;
  /** New in Phase 3B — same situation as `uploadChecklist` above; no
   *  real field name was ever found for an Optimization Checklist. */
  optimizationChecklist?: Record<string, boolean>;
  finalReviewChecklist?: Record<string, boolean>;
  recordingNotes?: string;
  editingNotes?: string;
  finalVideoNotes?: string;
  youtubeDescription?: string;
  pinnedComment?: string;
  tagsKeywords?: string;
  uploadNotes?: string;
  youtubeLink?: string;
  publishDate?: string;
  /** Preserved data, unresolved future UI placement — do not build a
   *  control for this in Phase 1. */
  communityPost?: string;
  createdDate?: string;
  lastUpdatedDate?: string;
  keyPointsInclude?: string;
  thingsToAvoid?: string;
  hook?: string;
  scriptCta?: string;
  scriptBuilderExtraNotes?: string;
  scriptBuilderSelectedFrameworkIds?: string[];
  scriptBuilderSelectedStoryProofIds?: string[];
  selectedInputQuestion?: string;
  shortFormType?: string;

  // Story Bank starting point — snapshotted from Business Brain at selection time.
  storyId?: string;
  storyName?: string;
  storyProblem?: string;
  storyPursuit?: string;
  storyPayoff?: string;
  storyLesson?: string;
  storyType?: string;

  // Framework starting point — snapshotted from Business Brain.
  framework?: BusinessBrainFramework;
  frameworkId?: string;

  // Product / Offer starting point.
  productOfferInput?: YtcsProductOfferInput;
  productOfferDeepDiveAnswers?: string;

  // Voice notes — Firebase Storage references only, never inline base64.
  brainDumpVoiceNotes?: YtcsVoiceNoteRef[];
  scriptBuilderVoiceNotes?: YtcsVoiceNoteRef[];
  productOfferDeepDiveVoiceNotes?: YtcsVoiceNoteRef[];
  /** New in Phase 2 — no real historical field name was ever found for
   *  generic Deep Dive voice notes (migration spec §19's unresolved
   *  item), so this follows the same naming convention as the other
   *  three voice-note fields above rather than reusing an unverified
   *  guess. Each ref's `questionAssociation` ties it to one of the
   *  fixed Deep Dive questions — see src/lib/ytcs/deep-dive-questions.ts. */
  deepDiveVoiceNotes?: YtcsVoiceNoteRef[];

  /** Historical structured-script-builder / in-app-title-generator /
   *  thumbnail data — preserved, never an active feature. Do not build
   *  UI for these fields; do not let a normal project save drop them. */
  legacy?: Record<string, unknown>;
  unknownFields?: Record<string, unknown>;

  migratedFromExport?: string;
  migratedAt?: unknown;

  /** New in the final completion phase — traces a project back to the
   *  Saved Idea it was created from via "Turn Into Video." No real field
   *  name existed for this (the real export has no such linkage; Saved
   *  Ideas and Video Projects were disconnected in the real data). Purely
   *  additive — never read by any earlier-phase code. */
  sourceIdeaId?: string;
  /** New in the final completion phase — Video Library's Archived tab.
   *  No real field name existed in the export (the legacy tool's Archive
   *  action was never captured writing to a specific field). A plain
   *  boolean, independent of `status`, so archiving never collides with
   *  the real step-name-shaped status values. */
  archived?: boolean;
}

export interface YtcsIdea {
  id: string;
  title?: string;
  type?: string;
  notes?: string;
  priority?: string;
  status?: string;
  lastUpdated?: unknown;
  ideaVoiceNotes?: YtcsVoiceNoteRef[];
  migratedFromExport?: string;
  migratedAt?: unknown;
}

/**
 * YTCS Settings — final completion phase. Sub-account-wide, matching
 * migration spec §20's own stated direction (`subAccounts/{id}/ytcs/
 * settings`, sibling to `ytcs/brain`) and the same scope as Business
 * Brain — no per-user preference model exists anywhere else in
 * Magnetix to adapt to instead, so this doesn't invent one. Applied
 * once, at project-creation time, onto each new project's own fields —
 * changing a default later never rewrites existing projects.
 */
export interface YtcsSettings {
  defaultScriptOutputType?: string;
  /** Only "Detailed" is real-confirmed (see Phase 2 findings) — this is
   *  stored but the Settings UI only ever offers "Detailed" as a
   *  selectable value, matching Script Prompt Builder's own already-
   *  established treatment. Balanced/Concise stay unresolved. */
  defaultDepthPreference?: string;
}
