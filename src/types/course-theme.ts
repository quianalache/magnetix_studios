import type { Timestamp, FieldValue } from "firebase/firestore";
import type { VideoProvider } from "./community";

/**
 * Standalone Course visual theming — colors, fonts, background, and an
 * ordered set of content blocks arranged into Header/Hero/Body/Sidebar
 * regions of the public sales page (`src/app/course/[saId]/[courseId]/page.tsx`).
 *
 * Modeled after GoHighLevel's own course-page theme editor (captured via a
 * batch of local HTML exports), deliberately simplified in a few places:
 *  - Every color is a single value — no separate regular/hover state.
 *  - The 6 optional block types (text/image/video/custom/crossSell/
 *    callToAction) are ONE shared union usable in either Body or Sidebar,
 *    not duplicated per-region (GHL's own sidebar variants of Custom/Image
 *    were field-for-field identical to the Body versions).
 *  - `CurriculumOutline` and the enroll/purchase CTA are NOT blocks — they're
 *    fixed, core page elements, same as GHL never exposed a "Delete" control
 *    on its curriculum ("Category") block.
 *
 * Stored inline on `StandaloneCourse.theme` (see standalone-courses.ts) —
 * courses created before this feature has no such field; every read falls
 * back to `DEFAULT_COURSE_THEME`.
 */

export interface CourseThemeColors {
  /** [near-white base, dark ink base] */
  base: [string, string];
  /** 4 accent swatches offered throughout the block/color pickers. */
  accent: [string, string, string, string];
}

export interface CourseThemeFontChoice {
  family: string;
  weight: string;
}

export interface CourseThemeFonts {
  primary: CourseThemeFontChoice;
  secondary: CourseThemeFontChoice;
}

export interface HeaderTheme {
  background: string;
  iconColor: string;
  searchBackground: string;
  searchBorder: string;
  searchPlaceholder: string;
}

export type HeroVerticalSpacing = "small" | "medium" | "large";

export interface HeroTheme {
  visible: boolean;
  backgroundType: "color" | "image";
  backgroundColor: string;
  backgroundImageUrl: string | null;
  overlayVisible: boolean;
  overlayColor: string;
  /** 0-100 */
  overlayOpacity: number;
  /** Hero subtitle — independent of `course.title`, which remains the single
   *  source of truth for the page's actual title text. */
  tagline: string;
  /** Label only — the button's behavior is always the existing EnrollModal. */
  buttonText: string;
  buttonColor: string;
  buttonTextColor: string;
  verticalSpacing: HeroVerticalSpacing;
}

export type ButtonType = "solid" | "link";
export type ButtonAlign = "left" | "center" | "right";

interface BlockBase {
  id: string;
  order: number;
}

export interface TextBlock extends BlockBase {
  type: "text";
  background: string;
  textColor: string;
  bodyHtml: string;
}

export interface ImageBlock extends BlockBase {
  type: "image";
  imageUrl: string | null;
  linkUrl: string | null;
}

export interface VideoBlock extends BlockBase {
  type: "video";
  videoUrl: string | null;
  videoProvider: VideoProvider | null;
  videoId: string | null;
}

export interface CustomBlock extends BlockBase {
  type: "custom";
  heading: string;
  headingColor: string;
  background: string;
  borderColor: string;
  bodyHtml: string;
  /** Color for the rich-text body content below the heading. Blocks saved
   *  before this field existed fall back to a readable dark gray at render
   *  time (see `CourseBlockView`'s "custom" case). */
  bodyTextColor: string;
  imageUrl: string | null;
  buttonVisible: boolean;
  buttonText: string;
  buttonType: ButtonType;
  buttonAlign: ButtonAlign;
  buttonColor: string;
  buttonTextColor: string;
  linkUrl: string;
}

export interface CrossSellBlock extends BlockBase {
  type: "crossSell";
  background: string;
  /** Another StandaloneCourse in the same sub-account, or null = unset. */
  targetCourseId: string | null;
  titleColor: string;
  priceColor: string;
  buttonText: string;
  buttonColor: string;
  buttonTextColor: string;
}

export interface CallToActionBlock extends BlockBase {
  type: "callToAction";
  buttonText: string;
  buttonType: ButtonType;
  buttonAlign: ButtonAlign;
  buttonColor: string;
  buttonTextColor: string;
  linkUrl: string;
}

/** The 6 optional block types — usable in either Body or Sidebar. */
export type CourseBlock =
  | TextBlock
  | ImageBlock
  | VideoBlock
  | CustomBlock
  | CrossSellBlock
  | CallToActionBlock;

export type CourseBlockType = CourseBlock["type"];

export interface ProgressSidebarBlock extends BlockBase {
  type: "progress";
  visible: boolean;
  background: string;
  barColor: string;
  textColor: string;
  text: string;
  promoImageUrl: string | null;
}

export interface InstructorSidebarBlock extends BlockBase {
  type: "instructor";
  visible: boolean;
  syncFromProfile: boolean;
  headshotUrl: string | null;
  background: string;
  heading: string;
  name: string;
  title: string;
  bio: string;
}

/**
 * Sidebar entries: the 2 core blocks (always present, not deletable — no
 * "Delete Block" control, only a visibility toggle) mixed into the same
 * ordered list as the 6 optional block types.
 */
export type SidebarBlock = CourseBlock | ProgressSidebarBlock | InstructorSidebarBlock;

export type SidebarBlockType = SidebarBlock["type"];

export const CORE_SIDEBAR_BLOCK_TYPES: readonly SidebarBlockType[] = [
  "progress",
  "instructor",
];

export function isCoreSidebarBlock(
  block: SidebarBlock,
): block is ProgressSidebarBlock | InstructorSidebarBlock {
  return block.type === "progress" || block.type === "instructor";
}

export interface CourseTheme {
  colors: CourseThemeColors;
  fonts: CourseThemeFonts;
  header: HeaderTheme;
  hero: HeroTheme;
  body: CourseBlock[];
  sidebar: SidebarBlock[];
}

/**
 * Sensible neutral defaults — used for any course that predates this
 * feature (via a fallback at read time, no migration needed) and stamped
 * onto every newly created course.
 */
export const DEFAULT_COURSE_THEME: CourseTheme = {
  colors: {
    base: ["#fafafa", "#202124"],
    accent: ["#202124", "#4b4b52", "#e4e4e4", "#909090"],
  },
  fonts: {
    primary: { family: "Inter", weight: "400" },
    secondary: { family: "Inter", weight: "700" },
  },
  header: {
    background: "#ffffff",
    iconColor: "#202124",
    searchBackground: "#f8f7f5",
    searchBorder: "#e4e4e4",
    searchPlaceholder: "Search courses, categories and lessons",
  },
  hero: {
    // Off by default — a prior product decision explicitly removed a
    // duplicate banner from the sales page and made the title the top-most
    // element; Hero is opt-in so no existing course regresses to having a
    // banner reappear above the title. When enabled, it renders ABOVE the
    // title as an additive decorative banner — the title itself never moves.
    visible: false,
    backgroundType: "color",
    backgroundColor: "#202124",
    backgroundImageUrl: null,
    overlayVisible: false,
    overlayColor: "#000000",
    overlayOpacity: 40,
    tagline: "",
    buttonText: "Enroll Now",
    buttonColor: "#202124",
    buttonTextColor: "#ffffff",
    verticalSpacing: "medium",
  },
  body: [],
  sidebar: [
    {
      id: "core-progress",
      order: 0,
      type: "progress",
      visible: true,
      background: "#f8f7f5",
      barColor: "#202124",
      textColor: "#202124",
      text: "Lessons are completed",
      promoImageUrl: null,
    },
    {
      id: "core-instructor",
      order: 1,
      type: "instructor",
      visible: true,
      syncFromProfile: true,
      headshotUrl: null,
      background: "#f8f7f5",
      heading: "Your Coach",
      name: "",
      title: "",
      bio: "",
    },
  ],
};

/**
 * Same `CourseTheme` shape, stamped onto a new Course Offer's `theme` field
 * instead of a course's. Offers reuse the entire theme system (colors,
 * fonts, header, hero, body blocks, sidebar blocks, templates) — the only
 * difference is the sidebar starts empty: `progress`/`instructor` are
 * course-lesson/course-instructor concepts that don't map cleanly onto an
 * Offer, which can bundle several courses at once. If a template that
 * happens to include those core blocks gets applied to an Offer, they're
 * stripped at apply time (see `applyCourseThemeTemplateToOfferServerSide`)
 * rather than rendered ambiguously.
 */
export const DEFAULT_OFFER_THEME: CourseTheme = {
  ...DEFAULT_COURSE_THEME,
  header: {
    ...DEFAULT_COURSE_THEME.header,
    searchPlaceholder: "Search",
  },
  sidebar: [],
};

/**
 * A saved, reusable course theme — lives at
 * `subAccounts/{saId}/courseThemeTemplates/{templateId}`, scoped to one
 * sub-account (not shareable across businesses/agencies, per product
 * decision). Applying a template is a deep COPY onto a course's `theme`
 * field (fresh block ids regenerated), never a live reference — editing the
 * template later must not retroactively change courses that already used it,
 * mirroring the capture/apply pattern used by Agency Snapshots
 * (`src/lib/snapshots/`).
 */
export interface CourseThemeTemplate {
  id: string;
  subAccountId: string;
  agencyId: string;
  name: string;
  theme: CourseTheme;
  createdAt: Timestamp | FieldValue | null;
  updatedAt: Timestamp | FieldValue | null;
}
