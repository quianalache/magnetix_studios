import type { Timestamp, FieldValue } from "firebase/firestore";

/**
 * Content Library — an exact clone of MomentumOS's real Content page
 * (Pipeline + Templates tabs; Analytics deferred). Every stage/type/field
 * name here was extracted directly from MomentumOS's production JS bundle
 * (~/Desktop/GHL Tools Export/deploy/momentum-os/), not guessed from the UI.
 */

export type ContentStage =
  | "idea"
  | "research"
  | "outline"
  | "script"
  | "recording"
  | "editing"
  | "assets"
  | "scheduled"
  | "published"
  | "repurposed";

/** Order + config exactly matching MomentumOS's `Iu` array / `Mr` object. */
export const CONTENT_STAGES: {
  value: ContentStage;
  label: string;
  emoji: string;
}[] = [
  { value: "idea", label: "Idea", emoji: "💡" },
  { value: "research", label: "Research", emoji: "🔍" },
  { value: "outline", label: "Outline", emoji: "📋" },
  { value: "script", label: "Script", emoji: "✍️" },
  { value: "recording", label: "Recording", emoji: "🎙️" },
  { value: "editing", label: "Editing", emoji: "✂️" },
  { value: "assets", label: "Thumbnail/Assets", emoji: "🖼️" },
  { value: "scheduled", label: "Scheduled", emoji: "📅" },
  { value: "published", label: "Published", emoji: "🚀" },
  { value: "repurposed", label: "Repurposed", emoji: "♻️" },
];

/** Exactly MomentumOS's `op` object. */
export type ContentType =
  | "youtube_long"
  | "youtube_short"
  | "instagram_reel"
  | "carousel"
  | "email"
  | "podcast"
  | "live_stream"
  | "blog"
  | "custom";

export const CONTENT_TYPES: { value: ContentType; label: string }[] = [
  { value: "youtube_long", label: "YouTube Long Form" },
  { value: "youtube_short", label: "YouTube Short" },
  { value: "instagram_reel", label: "Instagram Reel" },
  { value: "carousel", label: "Carousel" },
  { value: "email", label: "Email" },
  { value: "podcast", label: "Podcast" },
  { value: "live_stream", label: "Live Stream" },
  { value: "blog", label: "Blog" },
  { value: "custom", label: "Custom" },
];

/** Platform is a separate field from content type in the real app. */
export const CONTENT_PLATFORMS = [
  "YouTube",
  "Instagram",
  "TikTok",
  "Threads",
  "Facebook",
  "Podcast",
  "Email List",
  "Other",
] as const;
export type ContentPlatform = (typeof CONTENT_PLATFORMS)[number];

export type ContentPriority = "launch" | "high" | "medium" | "low";
export const CONTENT_PRIORITIES: ContentPriority[] = ["launch", "high", "medium", "low"];

export interface ContentChecklistItem {
  text: string;
  done: boolean;
}

export interface ContentItemDoc {
  id: string;
  agencyId: string;
  subAccountId: string;
  createdByUid: string;

  title: string;
  hook: string;
  contentType: ContentType;
  platform: ContentPlatform;
  stage: ContentStage;
  priority: ContentPriority;
  publishDate: Timestamp | FieldValue | null;
  deadline: Timestamp | FieldValue | null;
  /** Rich HTML — overview, talking points, notes. */
  description: string;
  estimatedMinutes: number | null;
  keywords: string;

  thumbnailText: string;
  cta: string;
  repurposingNotes: string;

  isEvergreen: boolean;
  checklist: ContentChecklistItem[];
  tags: string[];

  /** CRM-specific bridge into the Social Planner — MomentumOS has no
   *  equivalent since it doesn't publish anything itself. Set once this
   *  idea is promoted to a real scheduled post. */
  linkedSocialPostId: string | null;

  createdAt: Timestamp | FieldValue | null;
  updatedAt: Timestamp | FieldValue | null;
}

/** A saved template — system-seeded (the real 5 from MomentumOS) or
 *  operator-created. Applying one prefills the New Content dialog. */
export interface ContentTemplateDoc {
  id: string;
  agencyId: string;
  subAccountId: string;
  isSystem: boolean;

  name: string;
  description: string;
  category: string;
  contentType: ContentType;
  platform: ContentPlatform;
  defaultStage: ContentStage;
  defaultPriority: ContentPriority;
  hookFormula: string;
  /** Rich HTML outline — becomes the content item's `description`. */
  descriptionTemplate: string;
  ctaTemplate: string;
  repurposingNotes: string;
  estimatedMinutes: number | null;
  defaultTags: string[];
  /** Plain checklist text — becomes `{text, done:false}` items when applied. */
  checklist: string[];
  /** Only the YouTube template has these in the real app. */
  thumbnailTextFormula: string | null;
  keywords: string | null;
  isEvergreen: boolean;
  useCount: number;

  createdAt: Timestamp | FieldValue | null;
  updatedAt: Timestamp | FieldValue | null;
}

export function emptyContentItem(): Pick<
  ContentItemDoc,
  | "title"
  | "hook"
  | "contentType"
  | "platform"
  | "stage"
  | "priority"
  | "description"
  | "estimatedMinutes"
  | "keywords"
  | "thumbnailText"
  | "cta"
  | "repurposingNotes"
  | "isEvergreen"
  | "checklist"
  | "tags"
> {
  return {
    title: "",
    hook: "",
    contentType: "custom",
    platform: "Other",
    stage: "idea",
    priority: "medium",
    description: "",
    estimatedMinutes: null,
    keywords: "",
    thumbnailText: "",
    cta: "",
    repurposingNotes: "",
    isEvergreen: false,
    checklist: [],
    tags: [],
  };
}

export function emptyContentTemplate(): Omit<
  ContentTemplateDoc,
  "id" | "agencyId" | "subAccountId" | "isSystem" | "useCount" | "createdAt" | "updatedAt"
> {
  return {
    name: "",
    description: "",
    category: "",
    contentType: "custom",
    platform: "Other",
    defaultStage: "idea",
    defaultPriority: "medium",
    hookFormula: "",
    descriptionTemplate: "",
    ctaTemplate: "",
    repurposingNotes: "",
    estimatedMinutes: null,
    defaultTags: [],
    checklist: [],
    thumbnailTextFormula: null,
    keywords: null,
    isEvergreen: false,
  };
}

/**
 * The 5 real MomentumOS system templates, transcribed verbatim from its
 * production bundle (not paraphrased) — full HTML outlines and checklists
 * intact. Seeded once per sub-account on first visit to the Templates tab.
 */
export const SYSTEM_CONTENT_TEMPLATES: Array<
  Omit<ContentTemplateDoc, "id" | "agencyId" | "subAccountId" | "isSystem" | "useCount" | "createdAt" | "updatedAt">
> = [
  {
    name: "Weekly Newsletter",
    description: "Recurring weekly email to your list — roundup of content, insights, and a CTA.",
    category: "newsletter",
    contentType: "email",
    platform: "Email List",
    defaultStage: "outline",
    defaultPriority: "high",
    hookFormula: "[Topic]: what happened this week + what it means for you",
    descriptionTemplate:
      "<h2>This Week's Theme</h2><p></p><h2>3 Things I Learned</h2><ol><li></li><li></li><li></li></ol><h2>Content Roundup</h2><p></p><h2>Reader Resource</h2><p></p><h2>CTA</h2><p></p>",
    ctaTemplate: "Reply and tell me your biggest takeaway this week.",
    repurposingNotes: "Pull the 3 learnings into a Threads post. Top insight → Instagram carousel.",
    estimatedMinutes: 90,
    defaultTags: ["newsletter", "weekly", "email"],
    checklist: [
      "Draft subject line options (aim for 3)",
      "Write intro hook",
      "Fill in 3 learnings",
      "Add content roundup links",
      "Write CTA",
      "Proofread and schedule",
    ],
    thumbnailTextFormula: null,
    keywords: null,
    isEvergreen: false,
  },
  {
    name: "Monthly YouTube Video",
    description: "Full long-form YouTube video — scripted, edited, and published monthly.",
    category: "youtube",
    contentType: "youtube_long",
    platform: "YouTube",
    defaultStage: "idea",
    defaultPriority: "high",
    hookFormula: "How I [achieved result] in [timeframe] (without [common pain])",
    descriptionTemplate:
      "<h2>Hook (0:00–0:30)</h2><p></p><h2>Problem Setup (0:30–2:00)</h2><p></p><h2>Main Content / Steps</h2><h3>Step 1:</h3><p></p><h3>Step 2:</h3><p></p><h3>Step 3:</h3><p></p><h2>Case Study / Story</h2><p></p><h2>CTA + Subscribe Remind</h2><p></p>",
    ctaTemplate: "Subscribe for weekly creator strategy. Comment your #1 takeaway below.",
    repurposingNotes:
      "Cut 3 × 60s clips for YouTube Shorts. Pull key quote for Instagram Reel. Write email summary.",
    estimatedMinutes: 480,
    defaultTags: ["youtube", "long-form", "monthly"],
    checklist: [
      "Keyword research & title options",
      "Outline approved",
      "Script drafted",
      "B-roll list written",
      "Recording complete",
      "Editing complete",
      "Thumbnail created",
      "Description + tags written",
      "Scheduled / published",
    ],
    thumbnailTextFormula: "[NUMBER] [RESULT] in [TIMEFRAME]",
    keywords: "creator, strategy, growth",
    isEvergreen: true,
  },
  {
    name: "Weekly Instagram Reel",
    description: "Short-form vertical video for Instagram Reels — educational or entertaining.",
    category: "social",
    contentType: "instagram_reel",
    platform: "Instagram",
    defaultStage: "idea",
    defaultPriority: "medium",
    hookFormula: "[Controversial take or surprising stat] in first 3 seconds",
    descriptionTemplate:
      "<h2>Hook (0–3s)</h2><p></p><h2>Main Value Point</h2><p></p><h2>Tip/Step</h2><p></p><h2>CTA Overlay Text</h2><p></p>",
    ctaTemplate: "Save this for later. Follow for more creator tips.",
    repurposingNotes: "Post to TikTok same day. Pull audio quote for Threads.",
    estimatedMinutes: 60,
    defaultTags: ["reel", "instagram", "short-form"],
    checklist: [
      "Concept + hook locked",
      "Filmed",
      "Edited with captions",
      "Cover image set",
      "Caption written",
      "Posted + hashtags added",
    ],
    thumbnailTextFormula: null,
    keywords: null,
    isEvergreen: false,
  },
  {
    name: "Podcast Episode",
    description: "Weekly or bi-weekly podcast episode with show notes and repurposing plan.",
    category: "podcast",
    contentType: "podcast",
    platform: "Podcast",
    defaultStage: "outline",
    defaultPriority: "high",
    hookFormula: "Today we're talking about [topic] — and why [surprising angle]",
    descriptionTemplate:
      "<h2>Episode Topic</h2><p></p><h2>Guest (if any)</h2><p></p><h2>Talking Points</h2><ol><li></li><li></li><li></li></ol><h2>Key Quotes</h2><p></p><h2>Show Notes</h2><p></p><h2>Resources Mentioned</h2><p></p>",
    ctaTemplate: "Subscribe, leave a review, and share with one person who needs this.",
    repurposingNotes: "Pull 3 clips for Reels/Shorts. Write email teaser. Pull quotes for Threads/IG.",
    estimatedMinutes: 180,
    defaultTags: ["podcast", "audio", "interview"],
    checklist: [
      "Topic + guest confirmed",
      "Outline prepared",
      "Recording scheduled + completed",
      "Audio edited",
      "Show notes written",
      "Cover art uploaded",
      "Published to host",
      "Clips pulled for social",
    ],
    thumbnailTextFormula: null,
    keywords: null,
    isEvergreen: false,
  },
  {
    name: "Launch Email Sequence",
    description: "Email for an offer launch — announce, educate, and drive conversions.",
    category: "launch",
    contentType: "email",
    platform: "Email List",
    defaultStage: "script",
    defaultPriority: "launch",
    hookFormula: "[Big promise]: [Product/Offer name] is now open",
    descriptionTemplate:
      "<h2>Subject Line Options</h2><ol><li></li><li></li><li></li></ol><h2>Preview Text</h2><p></p><h2>Email Body</h2><h3>Opening Hook</h3><p></p><h3>Problem Agitation</h3><p></p><h3>Solution Reveal</h3><p></p><h3>Social Proof</h3><p></p><h3>Offer Details</h3><p></p><h3>CTA Button Text</h3><p></p><h3>P.S. line</h3><p></p>",
    ctaTemplate: "Get instant access → [link]",
    repurposingNotes: "Pull key lines for Instagram caption. Record short video reading the hook.",
    estimatedMinutes: 120,
    defaultTags: ["launch", "email", "offer", "sales"],
    checklist: [
      "3 subject line options written",
      "Body copy drafted",
      "CTA button tested",
      "Preview text set",
      "Send time scheduled",
      "Tracked in revenue log after send",
    ],
    thumbnailTextFormula: null,
    keywords: null,
    isEvergreen: false,
  },
];
