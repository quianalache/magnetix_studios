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
  generatedTitlePrompt?: string;
  selectedTitle?: string;
  backupTitle?: string;
  finalTitle?: string;
  createVideoStatus?: string;
  recordingChecklist?: Record<string, boolean>;
  editingChecklist?: Record<string, boolean>;
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

  /** Historical structured-script-builder / in-app-title-generator /
   *  thumbnail data — preserved, never an active feature. Do not build
   *  UI for these fields; do not let a normal project save drop them. */
  legacy?: Record<string, unknown>;
  unknownFields?: Record<string, unknown>;

  migratedFromExport?: string;
  migratedAt?: unknown;
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
}
