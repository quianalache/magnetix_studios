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
  searchIconColor: string;
  searchPlaceholder: string;
  searchPlaceholderColor: string;
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
  /** Color for `course.title` as rendered inside the hero banner itself. */
  titleColor: string;
  /** Hero subtitle — independent of `course.title`, which remains the single
   *  source of truth for the page's actual title text. */
  tagline: string;
  /** Label only — the button's behavior is always the existing EnrollModal. */
  buttonText: string;
  buttonColor: string;
  buttonBorderColor: string;
  buttonTextColor: string;
  buttonColorHover: string;
  buttonBorderColorHover: string;
  buttonTextColorHover: string;
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
  buttonBorderColor: string;
  buttonTextColor: string;
  buttonColorHover: string;
  buttonBorderColorHover: string;
  buttonTextColorHover: string;
  linkUrl: string;
}

export interface CrossSellBlock extends BlockBase {
  type: "crossSell";
  background: string;
  /** A CourseOffer in the same sub-account, or null = unset. Offers (not
   *  raw Courses) are the actual purchasable/checkout entity, so cross-sell
   *  always promotes into a real checkout flow. */
  targetOfferId: string | null;
  titleColor: string;
  priceColor: string;
  buttonText: string;
  buttonColor: string;
  buttonBorderColor: string;
  buttonTextColor: string;
  buttonColorHover: string;
  buttonBorderColorHover: string;
  buttonTextColorHover: string;
}

export interface CallToActionBlock extends BlockBase {
  type: "callToAction";
  buttonText: string;
  buttonType: ButtonType;
  buttonAlign: ButtonAlign;
  buttonColor: string;
  buttonBorderColor: string;
  buttonTextColor: string;
  buttonColorHover: string;
  buttonBorderColorHover: string;
  buttonTextColorHover: string;
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
  headshotVisible: boolean;
  background: string;
  heading: string;
  headingColor: string;
  name: string;
  nameColor: string;
  title: string;
  titleColor: string;
  bio: string;
  bioColor: string;
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

/** Page-wide background, separate from the Hero's own background — sits
 *  behind the entire page rather than just the hero banner region. */
export interface CourseThemeBackground {
  imageUrl: string | null;
  /** 0-100. 100 = fully opaque. */
  transparency: number;
}

/**
 * Styling for the curriculum accordion ("Category Block" in GHL's own
 * naming). Only the fields that map to something the accordion actually
 * renders today are included — no lesson-description snippet or nested-
 * subcategory concept exists in our curriculum, so those reference fields
 * (Lesson Description Color, Sub Category *, Subcategory Margin) are
 * intentionally not modeled.
 */
export interface CategoryBlockTheme {
  background: string;
  borderColor: string;
  hoverColor: string;
  categoryTitleColor: string;
  lessonTitleColor: string;
}

/**
 * The curriculum accordion as a real entry in the `body` list — reorderable
 * like any other block (not pinned first), but still not deletable, same
 * treatment as Progress/Instructor in the sidebar.
 */
export interface CategoryCoreBlock extends BlockBase, CategoryBlockTheme {
  type: "category";
}

/** Body entries: the curriculum accordion (fixed core, not deletable) mixed
 *  into the same ordered list as the 6 optional block types. */
export type BodyBlock = CourseBlock | CategoryCoreBlock;

export function isCoreBodyBlock(block: BodyBlock): block is CategoryCoreBlock {
  return block.type === "category";
}

export interface CourseTheme {
  colors: CourseThemeColors;
  fonts: CourseThemeFonts;
  background: CourseThemeBackground;
  header: HeaderTheme;
  hero: HeroTheme;
  body: BodyBlock[];
  sidebar: SidebarBlock[];
}

/**
 * Visual theming for the enrolled member's Lesson-viewing page
 * (`StandaloneLessonPlayer`, at `/course/[saId]/[courseId]/classroom/
 * [lessonId]`) — stored independently from `StandaloneCourse.theme` (which
 * only covers the Product/Course-Home pages), matching GHL's own "Pages:
 * Product / Lesson" switcher in the same Customize editor. Colors/fonts/
 * background reuse the exact same shapes as `CourseTheme` (same picker UI,
 * independent values, never synced) — everything else here is genuinely
 * specific to the lesson-viewing experience.
 */
export interface LessonBreadcrumbTheme {
  visible: boolean;
  color: string;
  activeColor: string;
}

export interface LessonPlayerTheme {
  backgroundColor: string;
}

/** One button's full text + Regular/Hover fill/border/text config — reused
 *  for both Call-To-Action states and both Course-Content nav buttons via
 *  `<ButtonColorFields>` (already built for the Product-page button fields). */
export interface LessonButtonState {
  text: string;
  buttonType: ButtonType;
  color: string;
  borderColor: string;
  textColor: string;
  colorHover: string;
  borderColorHover: string;
  textColorHover: string;
}

export interface LessonBodyTheme {
  background: string;
  /** GHL labels this "Lesson Title" but it's the "About this Lesson"
   *  section's own heading text/color — the lesson's real title
   *  (`StandaloneLesson.title`) has no color control here. */
  aboutHeadingText: string;
  aboutHeadingColor: string;
  ctaIncomplete: LessonButtonState;
  ctaCompleted: LessonButtonState;
  nextLessonCard: {
    backgroundColor: string;
    borderColor: string;
    messageText: string;
    messageColor: string;
    buttonText: string;
    buttonTextColor: string;
    nextLessonTitleColor: string;
  };
}

export interface LessonCourseContentBlock extends BlockBase {
  type: "courseContent";
  background: string;
  heading: string;
  headingColor: string;
  lessonCountColor: string;
  itemHoverColor: string;
  itemTextColor: string;
  itemBorderColor: string;
  previousButton: LessonButtonState;
  nextButton: LessonButtonState;
}

export interface LessonDownloadsBlock extends BlockBase {
  type: "downloads";
  heading: string;
  headingColor: string;
  background: string;
  linkColor: string;
}

/**
 * Sidebar entries: 3 core blocks (always present, not deletable) mixed into
 * the same ordered list as the 6 optional block types — no Progress block
 * here (that's a Course-Home concept; a single lesson has no aggregate
 * progress bar of its own).
 */
export type LessonSidebarBlock =
  | InstructorSidebarBlock
  | LessonCourseContentBlock
  | LessonDownloadsBlock
  | CourseBlock;

export type LessonSidebarBlockType = LessonSidebarBlock["type"];

export const LESSON_CORE_SIDEBAR_BLOCK_TYPES: readonly LessonSidebarBlockType[] = [
  "instructor",
  "courseContent",
  "downloads",
];

export function isLessonCoreSidebarBlock(
  block: LessonSidebarBlock,
): block is InstructorSidebarBlock | LessonCourseContentBlock | LessonDownloadsBlock {
  return (
    block.type === "instructor" ||
    block.type === "courseContent" ||
    block.type === "downloads"
  );
}

export interface LessonTheme {
  colors: CourseThemeColors;
  fonts: CourseThemeFonts;
  background: CourseThemeBackground;
  breadcrumb: LessonBreadcrumbTheme;
  player: LessonPlayerTheme;
  body: LessonBodyTheme;
  sidebar: LessonSidebarBlock[];
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
  background: {
    imageUrl: null,
    transparency: 100,
  },
  header: {
    background: "#ffffff",
    iconColor: "#202124",
    searchBackground: "#f8f7f5",
    searchBorder: "#e4e4e4",
    searchIconColor: "#202124",
    searchPlaceholder: "Search courses, categories and lessons",
    searchPlaceholderColor: "#909090",
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
    titleColor: "#ffffff",
    tagline: "",
    buttonText: "Enroll Now",
    buttonColor: "#202124",
    buttonBorderColor: "#202124",
    buttonTextColor: "#ffffff",
    buttonColorHover: "#3a3a44",
    buttonBorderColorHover: "#3a3a44",
    buttonTextColorHover: "#ffffff",
    verticalSpacing: "medium",
  },
  body: [
    {
      id: "core-category",
      order: 0,
      type: "category",
      background: "#ffffff",
      borderColor: "#e4e4e4",
      hoverColor: "#f8f7f5",
      categoryTitleColor: "#202124",
      lessonTitleColor: "#202124",
    },
  ],
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
      headshotVisible: true,
      background: "#f8f7f5",
      heading: "Your Coach",
      headingColor: "#909090",
      name: "",
      nameColor: "#202124",
      title: "",
      titleColor: "#909090",
      bio: "",
      bioColor: "#202124",
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
  // No curriculum accordion for an Offer (it bundles courses, not lessons of
  // its own), so the Category Block core entry doesn't apply — same
  // reasoning as the empty sidebar below.
  body: [],
  sidebar: [],
};

function defaultLessonButtonState(text: string): LessonButtonState {
  return {
    text,
    buttonType: "solid",
    color: "#202124",
    borderColor: "#202124",
    textColor: "#ffffff",
    colorHover: "#3a3a44",
    borderColorHover: "#3a3a44",
    textColorHover: "#ffffff",
  };
}

/**
 * Sensible neutral defaults for the Lesson page's own theme — used for any
 * course that predates this feature (via a fallback at read time, no
 * migration needed) and stamped onto every newly created course, alongside
 * `DEFAULT_COURSE_THEME`.
 */
export const DEFAULT_LESSON_THEME: LessonTheme = {
  colors: DEFAULT_COURSE_THEME.colors,
  fonts: DEFAULT_COURSE_THEME.fonts,
  background: {
    imageUrl: null,
    transparency: 100,
  },
  breadcrumb: {
    visible: true,
    color: "#909090",
    activeColor: "#202124",
  },
  player: {
    backgroundColor: "#ffffff",
  },
  body: {
    background: "#ffffff",
    aboutHeadingText: "About this Lesson",
    aboutHeadingColor: "#202124",
    ctaIncomplete: defaultLessonButtonState("Mark as complete"),
    ctaCompleted: defaultLessonButtonState("Completed"),
    nextLessonCard: {
      backgroundColor: "#f8f7f5",
      borderColor: "#e4e4e4",
      messageText: "Great job! Keep going!",
      messageColor: "#202124",
      buttonText: "Next lesson",
      buttonTextColor: "#202124",
      nextLessonTitleColor: "#909090",
    },
  },
  sidebar: [
    {
      id: "core-course-content",
      order: 0,
      type: "courseContent",
      background: "#ffffff",
      heading: "Course Contents",
      headingColor: "#202124",
      lessonCountColor: "#909090",
      itemHoverColor: "#f8f7f5",
      itemTextColor: "#3a3a44",
      itemBorderColor: "#e4e4e4",
      previousButton: defaultLessonButtonState("Previous Category"),
      nextButton: defaultLessonButtonState("Next Category"),
    },
    {
      id: "core-instructor",
      order: 1,
      type: "instructor",
      visible: true,
      syncFromProfile: true,
      headshotUrl: null,
      headshotVisible: true,
      background: "#f8f7f5",
      heading: "Your Coach",
      headingColor: "#909090",
      name: "",
      nameColor: "#202124",
      title: "",
      titleColor: "#909090",
      bio: "",
      bioColor: "#202124",
    },
    {
      id: "core-downloads",
      order: 2,
      type: "downloads",
      heading: "Attached Files",
      headingColor: "#202124",
      background: "#f8f7f5",
      linkColor: "#202124",
    },
  ],
};

/**
 * Backfills top-level fields added to `CourseTheme` after a course/offer's
 * theme was first saved — Firestore docs written before those fields
 * existed simply don't have the keys, so a plain
 * `data.theme ?? DEFAULT_*_THEME` (which only covers a theme missing
 * *entirely*) leaves them `undefined` at render time. Nested per-field
 * additions (e.g. `hero.titleColor`) are handled separately, with a `??`
 * fallback at each render site, since those live inside an already-present
 * sub-object.
 */
export function normalizeCourseTheme(
  theme: CourseTheme | null | undefined,
  fallbackDefault: CourseTheme,
): CourseTheme {
  if (!theme) return fallbackDefault;
  const merged: CourseTheme = {
    ...fallbackDefault,
    ...theme,
    background: theme.background ?? fallbackDefault.background,
  };
  if (!merged.body.some((b) => b.type === "category")) {
    // Two legacy shapes collapse into the same fallback here: (a) a course
    // saved before the Category Block existed at all, or (b) one saved in
    // the brief window it lived as its own top-level `categoryBlock` field,
    // before becoming a reorderable `body` entry — reuse that old field's
    // styling if present, otherwise fall back to the default. Offers never
    // get one added (`DEFAULT_OFFER_THEME.body` has no category entry to
    // fall back to), matching how they've never had a curriculum.
    const legacyCategoryBlock = (theme as unknown as { categoryBlock?: CategoryBlockTheme })
      .categoryBlock;
    const defaultCategoryBlock = fallbackDefault.body.find(
      (b): b is CategoryCoreBlock => b.type === "category",
    );
    if (legacyCategoryBlock || defaultCategoryBlock) {
      merged.body = [
        {
          id: "core-category",
          order: -1,
          type: "category",
          ...(legacyCategoryBlock ?? defaultCategoryBlock!),
        },
        ...merged.body,
      ];
    }
  }
  return merged;
}

/** Same top-level-key backfill as `normalizeCourseTheme`, for
 *  `StandaloneCourse.lessonTheme` — a field that doesn't exist at all on
 *  courses saved before this feature. */
export function normalizeLessonTheme(
  theme: LessonTheme | null | undefined,
  fallbackDefault: LessonTheme,
): LessonTheme {
  if (!theme) return fallbackDefault;
  return {
    ...fallbackDefault,
    ...theme,
    background: theme.background ?? fallbackDefault.background,
  };
}

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
  /** Templates saved before the Lesson page theme existed have no such
   *  field; applying one of those leaves the target's `lessonTheme`
   *  untouched (falls back to `DEFAULT_LESSON_THEME` at read time). */
  lessonTheme?: LessonTheme;
  createdAt: Timestamp | FieldValue | null;
  updatedAt: Timestamp | FieldValue | null;
}
