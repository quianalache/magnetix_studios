import type { Timestamp, FieldValue } from "firebase/firestore";

/**
 * Content Library — the "ideation" half of content planning that the Social
 * Planner (src/types/social.ts) never had; it only ever covered scheduling.
 * Modeled on the real MomentumOS content-table shape (extracted from its
 * production bundle): a stage pipeline distinct from a SocialPost's publish
 * status, plus hook/thumbnail/evergreen/repurposing fields aimed at
 * planning a piece of content before it's ready to actually schedule.
 */

export type ContentStage =
  | "idea"
  | "in_progress"
  | "scheduled"
  | "published"
  | "repurposed";

export type ContentType =
  | "youtube_long"
  | "youtube_short"
  | "instagram_reel"
  | "podcast_episode"
  | "email"
  | "blog"
  | "other";

export const CONTENT_STAGES: { value: ContentStage; label: string }[] = [
  { value: "idea", label: "Idea" },
  { value: "in_progress", label: "In Progress" },
  { value: "scheduled", label: "Scheduled" },
  { value: "published", label: "Published" },
  { value: "repurposed", label: "Repurposed" },
];

export const CONTENT_TYPES: { value: ContentType; label: string }[] = [
  { value: "youtube_long", label: "YouTube (long)" },
  { value: "youtube_short", label: "YouTube Short" },
  { value: "instagram_reel", label: "Instagram Reel" },
  { value: "podcast_episode", label: "Podcast episode" },
  { value: "email", label: "Email" },
  { value: "blog", label: "Blog" },
  { value: "other", label: "Other" },
];

export interface ContentItemDoc {
  id: string;
  agencyId: string;
  subAccountId: string;
  createdByUid: string;

  title: string;
  stage: ContentStage;
  contentType: ContentType;
  /** MomentumOS's "hook_formula" — the opening line/angle. */
  hook: string;
  /** Script/outline/planning notes. */
  notes: string;
  thumbnailText: string;
  isEvergreen: boolean;
  isFavorite: boolean;
  /** Informal target date — NOT the real send time. Once promoted to a
   *  real scheduled post, `linkedSocialPostId`'s own `scheduledAt` is the
   *  actual publish time. */
  targetPublishDate: Timestamp | FieldValue | null;
  /** Set once this idea is promoted to a real, schedulable post via the
   *  Social Planner composer. Null while still just an idea/draft. */
  linkedSocialPostId: string | null;

  createdAt: Timestamp | FieldValue | null;
  updatedAt: Timestamp | FieldValue | null;
}

export function emptyContentItem(): Pick<
  ContentItemDoc,
  "title" | "stage" | "contentType" | "hook" | "notes" | "thumbnailText" | "isEvergreen" | "isFavorite"
> {
  return {
    title: "",
    stage: "idea",
    contentType: "other",
    hook: "",
    notes: "",
    thumbnailText: "",
    isEvergreen: false,
    isFavorite: false,
  };
}
