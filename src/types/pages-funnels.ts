import type { Timestamp, FieldValue } from "firebase/firestore";

/**
 * Native Pages & Funnels builder — the data model for a block-based visual
 * page, distinct from the GitPage-powered "Website" AI site generator
 * (src/app/(dashboard)/sa/[subAccountId]/website) which stays untouched.
 *
 * A `PageDoc` is `agencyId`/`subAccountId`-scoped like every other tenant
 * document in this repo (forms, offers, etc.) — `subAccountId` is nullable
 * so the same model can eventually back agency-owned pages (e.g. the
 * Magnetix marketing site itself) without a schema change. `blocks` is an
 * ordered array of typed, extensible `PageBlock`s; the renderer
 * (src/components/pages-funnels/renderer) walks this array to paint the
 * page identically in the editor canvas, a public preview, and eventually
 * AI-generated or templated pages — none of those surfaces get their own
 * parallel format.
 */

export type PageType =
  | "landing"
  | "sales"
  | "waitlist"
  | "webinar"
  | "checkout"
  | "thank_you"
  | "generic";

export type PageStatus = "draft" | "published";

/** Mirrors the "Goal" field on the Create New Page panel. Informational only
 *  in this phase — nothing branches on it yet, but it's stored so a future
 *  AI-generation or analytics pass has it to key off of. */
export type PageGoal =
  | "lead_generation"
  | "sales"
  | "registration"
  | "confirmation"
  | "other";

export const PAGE_TYPE_LABELS: Record<PageType, string> = {
  landing: "Landing Page",
  sales: "Sales Page",
  waitlist: "Waitlist Page",
  webinar: "Webinar Registration",
  checkout: "Checkout Page",
  thank_you: "Thank You Page",
  generic: "Blank Page",
};

export const PAGE_GOAL_LABELS: Record<PageGoal, string> = {
  lead_generation: "Lead Generation",
  sales: "Sales / Conversion",
  registration: "Event Registration",
  confirmation: "Confirmation / Delivery",
  other: "Other",
};

/** How a page was started — kept for the library UI ("Built with AI" chip,
 *  future re-generation) and to know a page came from a template. */
export type PageOrigin = "blank" | "template" | "ai";

export type BlockAlignment = "left" | "center" | "right";
export type BackgroundStyle = "none" | "solid" | "gradient" | "image";
export type ButtonStyle = "primary" | "secondary" | "outline";

/** Every block shares a padding-only spacing model in this phase — enough to
 *  prove the Spacing settings tab without over-building. */
export interface BlockSpacing {
  paddingTop: number;
  paddingBottom: number;
}

export const DEFAULT_BLOCK_SPACING: BlockSpacing = {
  paddingTop: 64,
  paddingBottom: 64,
};

interface BlockBase {
  id: string;
  spacing: BlockSpacing;
}

export interface HeroBlockContent {
  headline: string;
  subheadline: string;
  buttonText: string;
  buttonLink: string;
  buttonOpenInNewTab: boolean;
  /** Visual treatment for the primary button — same `ButtonStyle` union the
   *  standalone Button block uses, so Hero's CTA styles from one shared
   *  vocabulary rather than a parallel one. Optional on the type because
   *  pages saved before this field existed won't have it on disk; every
   *  reader falls back to "primary" (`content.buttonStyle ?? "primary"`)
   *  rather than requiring a data migration. */
  buttonStyle?: ButtonStyle;
  secondaryLinkText: string;
  secondaryLinkLink: string;
  alignment: BlockAlignment;
  backgroundStyle: BackgroundStyle;
}
export interface HeroBlock extends BlockBase {
  type: "hero";
  content: HeroBlockContent;
}

export interface HeadingBlockContent {
  text: string;
  level: "h1" | "h2" | "h3";
  alignment: BlockAlignment;
}
export interface HeadingBlock extends BlockBase {
  type: "heading";
  content: HeadingBlockContent;
}

export interface TextBlockContent {
  text: string;
  alignment: BlockAlignment;
}
export interface TextBlock extends BlockBase {
  type: "text";
  content: TextBlockContent;
}

export interface ButtonBlockContent {
  text: string;
  link: string;
  openInNewTab: boolean;
  style: ButtonStyle;
  alignment: BlockAlignment;
}
export interface ButtonBlock extends BlockBase {
  type: "button";
  content: ButtonBlockContent;
}

export interface ImageBlockContent {
  src: string;
  alt: string;
  link: string;
}
export interface ImageBlock extends BlockBase {
  type: "image";
  content: ImageBlockContent;
}

export interface FeatureItem {
  id: string;
  title: string;
  description: string;
}
export interface FeaturesBlockContent {
  eyebrow: string;
  headline: string;
  items: FeatureItem[];
}
export interface FeaturesBlock extends BlockBase {
  type: "features";
  content: FeaturesBlockContent;
}

export interface TestimonialItem {
  id: string;
  quote: string;
  name: string;
}
export interface TestimonialsBlockContent {
  eyebrow: string;
  headline: string;
  items: TestimonialItem[];
}
export interface TestimonialsBlock extends BlockBase {
  type: "testimonials";
  content: TestimonialsBlockContent;
}

export interface FaqItem {
  id: string;
  question: string;
  answer: string;
}
export interface FaqBlockContent {
  eyebrow: string;
  headline: string;
  items: FaqItem[];
}
export interface FaqBlock extends BlockBase {
  type: "faq";
  content: FaqBlockContent;
}

export interface CtaBlockContent {
  headline: string;
  subheadline: string;
  buttonText: string;
  buttonLink: string;
  backgroundStyle: BackgroundStyle;
}
export interface CtaBlock extends BlockBase {
  type: "cta";
  content: CtaBlockContent;
}

export interface DividerBlockContent {
  style: "line" | "space";
}
export interface DividerBlock extends BlockBase {
  type: "divider";
  content: DividerBlockContent;
}

export interface SpacerBlockContent {
  height: number;
}
export interface SpacerBlock extends BlockBase {
  type: "spacer";
  content: SpacerBlockContent;
}

/** References an existing native Magnetix Form rather than duplicating its
 *  field schema — `formName` is a denormalized snapshot purely so the
 *  canvas/library can show a label without an extra read; the renderer
 *  always re-fetches the live `LeadForm` by `formId` to actually render it. */
export interface FormBlockContent {
  formId: string | null;
  formName: string | null;
}
export interface FormBlock extends BlockBase {
  type: "form";
  content: FormBlockContent;
}

export type PageBlock =
  | HeroBlock
  | HeadingBlock
  | TextBlock
  | ButtonBlock
  | ImageBlock
  | FeaturesBlock
  | TestimonialsBlock
  | FaqBlock
  | CtaBlock
  | DividerBlock
  | SpacerBlock
  | FormBlock;

export type BlockType = PageBlock["type"];

export interface PageSeo {
  title: string;
  description: string;
  ogImage: string;
}

export const DEFAULT_PAGE_SEO: PageSeo = { title: "", description: "", ogImage: "" };

export interface PageDoc {
  id: string;
  agencyId: string;
  /** Null = agency-owned page. Every page created through the sub-account
   *  dashboard in this phase sets this; kept nullable so the same engine
   *  can back agency-level pages later without a migration. */
  subAccountId: string | null;
  name: string;
  slug: string;
  pageType: PageType;
  goal: PageGoal;
  status: PageStatus;
  origin: PageOrigin;
  /** Placeholder relationship for the future funnel engine (ordered pages —
   *  opt-in, thank-you, sales, checkout). Not read or written by anything
   *  yet beyond the Create New Page panel's funnel picker stub. */
  funnelId: string | null;
  blocks: PageBlock[];
  seo: PageSeo;
  templateId: string | null;
  createdByUid: string;
  createdAt: Timestamp | FieldValue;
  updatedAt: Timestamp | FieldValue;
  publishedAt: Timestamp | FieldValue | null;
}

export type CreatePageInput = {
  name: string;
  pageType: PageType;
  goal: PageGoal;
  origin: PageOrigin;
  templateId?: string | null;
  blocks?: PageBlock[];
};
