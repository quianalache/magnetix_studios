import type { Timestamp, FieldValue } from "firebase/firestore";
import type { VideoProvider, ResourceLink } from "./community";
import type { CourseTheme, LessonTheme } from "./course-theme";

/**
 * Standalone Courses — a course/product sold on its own public sales page,
 * independent of Community. Reuses the same `Member`/magic-link identity as
 * Community (see `src/types/community.ts`) since that identity is already
 * scoped to the sub-account, not to a group. Lives at
 * `subAccounts/{saId}/standaloneCourses/{courseId}`, a structural sibling of
 * `communityGroups`, not nested under it — a standalone course has no group
 * and no membership/level concept.
 */
export type StandaloneCourseAccess = "open" | "purchase";
/** Only meaningful when `access === "purchase"` — a course's own direct-sale
 *  price can be a single one-time charge or a subscription, independent of
 *  the Course Offers bundling/pricing layer (a course and an offer are two
 *  different things — each has its own complete pricing model). */
export type StandaloneCourseBillingType = "oneTime" | "recurring";
export type StandaloneCourseRecurringInterval = "day" | "week" | "month" | "year";

/** Course tags — discovery/filter metadata, shown in the editor's Settings
 *  tab. `topic` is a fixed list (see `src/lib/standalone-courses/course-tags.ts`),
 *  `language` is free-text. */
export type StandaloneCourseDifficulty =
  | "beginner"
  | "intermediate"
  | "advanced"
  | "expert";

/** Instructor bio shown on the course detail/checkout pages — also the
 *  "profile" the Course Theme's instructor sidebar block can sync from
 *  (`CourseTheme`'s `syncFromProfile` flag). */
export interface StandaloneCourseInstructor {
  heading: string;
  name: string;
  title: string;
  bio: string;
  headshotUrl: string | null;
}

export const DEFAULT_STANDALONE_COURSE_INSTRUCTOR: StandaloneCourseInstructor = {
  heading: "Instructor",
  name: "",
  title: "",
  bio: "",
  headshotUrl: null,
};

/** Player behavior toggles — all on by default, matching the GHL reference. */
export interface StandaloneCourseLearningExperience {
  autoplayNextLesson: boolean;
  autoplayFirstLesson: boolean;
  autoCompleteLessons: boolean;
}

export const DEFAULT_STANDALONE_COURSE_LEARNING_EXPERIENCE: StandaloneCourseLearningExperience =
  {
    autoplayNextLesson: true,
    autoplayFirstLesson: true,
    autoCompleteLessons: true,
  };

export interface StandaloneCourseAdvanced {
  customJs: string;
  customCss: string;
  headerTrackingCode: string;
  footerTrackingCode: string;
}

export const DEFAULT_STANDALONE_COURSE_ADVANCED: StandaloneCourseAdvanced = {
  customJs: "",
  customCss: "",
  headerTrackingCode: "",
  footerTrackingCode: "",
};

export interface StandaloneCourse {
  id: string;
  subAccountId: string;
  agencyId: string;
  title: string;
  /** Rich-text "About this course" copy, sanitized at render (reuses sanitizeLessonHtml). */
  aboutHtml: string;
  /** Banner/hero image on the public sales page. */
  coverUrl: string | null;
  /** Single free-text tag, e.g. "Creative". Null = no pill shown. */
  category: string | null;
  access: StandaloneCourseAccess;
  /** Price (cents) when `access === "purchase"` — the amount per charge,
   *  whether one-time or per billing cycle. */
  priceCents: number | null;
  currency: string | null;
  /** Null when `access !== "purchase"`. Defaults to "oneTime". */
  billingType: StandaloneCourseBillingType | null;
  /** Only set when `billingType === "recurring"`. */
  recurringInterval: StandaloneCourseRecurringInterval | null;
  /** Days before the first charge — only meaningful when `billingType ===
   *  "recurring"`. Null/0 = bill immediately. */
  trialDays: number | null;
  /** Denormalized count of enrolled members, for the sales-page stat. */
  enrollmentCount: number;
  /** Show the enrollment count on the public sales page. Off by default —
   *  an owner opts in per course. */
  showMemberCount: boolean;
  /** Discovery/filter tags — Settings tab. All null until the owner sets them. */
  language: string | null;
  difficulty: StandaloneCourseDifficulty | null;
  topic: string | null;
  instructor: StandaloneCourseInstructor;
  /** Per-course branding overrides — Settings tab. */
  logoUrl: string | null;
  faviconUrl: string | null;
  learningExperience: StandaloneCourseLearningExperience;
  advanced: StandaloneCourseAdvanced;
  /** Visual theme — colors, fonts, background, and content blocks for the
   *  public sales page. Courses created before this feature has no such
   *  field; every read falls back to `DEFAULT_COURSE_THEME`. */
  theme: CourseTheme;
  /** Visual theme for the enrolled member's Lesson-viewing page — stored
   *  independently from `theme` (which only covers the Product/Course-Home
   *  pages), matching GHL's own "Pages: Product / Lesson" switcher. Courses
   *  created before this feature has no such field; every read falls back
   *  to `DEFAULT_LESSON_THEME`. */
  lessonTheme: LessonTheme;
  published: boolean;
  /** Community Groups linked to this course (`subAccounts/{saId}/
   *  communityGroups/{groupId}`) — connects a course built "outside" a
   *  community to one or more groups "inside" Community. Anyone who enrolls
   *  in (free or paid) this course is auto-granted active membership in
   *  every linked group, see `grantLinkedCommunityGroupsServerSide`. Courses
   *  created before this feature has no such field; every read falls back
   *  to an empty array. */
  linkedCommunityGroupIds: string[];
  createdAt: Timestamp | FieldValue | null;
  updatedAt: Timestamp | FieldValue | null;
}

export interface StandaloneCourseSection {
  id: string;
  title: string;
  order: number;
}

export interface StandaloneLesson {
  id: string;
  sectionId: string | null;
  title: string;
  order: number;
  published: boolean;
  videoUrl: string | null;
  videoProvider: VideoProvider | null;
  videoId: string | null;
  bodyHtml: string;
  resourceLinks: ResourceLink[];
  createdAt: Timestamp | FieldValue | null;
  updatedAt: Timestamp | FieldValue | null;
}

/**
 * A member's enrollment + progress in a standalone course, at
 * `standaloneCourses/{courseId}/enrollments/{memberId}`. Same shape as
 * Community's Enrollment.
 */
export interface StandaloneEnrollment {
  id: string;
  memberId: string;
  courseId: string;
  status: "enrolled" | "completed";
  completedLessonIds: string[];
  progressPct: number;
  enrolledAt: Timestamp | FieldValue | null;
  completedAt: Timestamp | FieldValue | null;
  /** Offer Access rules (Course Offers feature) — null unless the
   *  enrollment was granted by an Offer with a "begin at date" or
   *  "restrict to N days" rule. Checked by the classroom-access guard
   *  alongside the existing enrolled/paid checks. */
  accessBeginsAt?: Timestamp | FieldValue | null;
  accessExpiresAt?: Timestamp | FieldValue | null;
}

/**
 * A one-time purchase for a standalone course, at
 * `standaloneCourses/{courseId}/purchases/{purchaseId}`. Simpler than
 * Community's Purchase — no `scope`/`targetId` discriminator needed since
 * every purchase here IS a course purchase.
 *
 * Two payment methods: `paypal` (v1, manual-reconcile — staff marks paid)
 * and `stripe` (instant — a webhook marks paid the moment the charge
 * succeeds, see `handleStandaloneCourseCheckoutCompleted`). Docs written
 * before `method` existed have no such field; every read site treats a
 * missing `method` as `"paypal"`.
 */
export type StandaloneCoursePurchaseStatus =
  | "pending"
  | "paid"
  | "void"
  | "canceled";
export type StandaloneCoursePurchaseMethod = "paypal" | "stripe";

export interface StandaloneCoursePurchase {
  id: string;
  subAccountId: string;
  agencyId: string;
  courseId: string;
  memberId: string;
  amountCents: number;
  currency: string;
  method: StandaloneCoursePurchaseMethod;
  paypalUrl: string | null;
  stripeCheckoutSessionId: string | null;
  stripePaymentIntentId: string | null;
  /** Saved for subscription purchases so a canceled subscription can be
   *  looked back up by `stripeSubscriptionId`. */
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
  status: StandaloneCoursePurchaseStatus;
  grantedByUid: string | null;
  requestedAt: Timestamp | FieldValue | null;
  paidAt: Timestamp | FieldValue | null;
  /** Set when this marker was stamped by an Offer purchase covering this
   *  course (Course Offers feature), rather than a direct course purchase —
   *  lets `hasPaidStandaloneCourse`'s existing gate check recognize
   *  Offer-granted access on a course that also has its own `access:
   *  "purchase"` direct-sale mode, with no change to that guard itself. */
  offerId?: string | null;
}

/** A curriculum-outline entry for the public sales page (summary only, no lesson links). */
export interface StandaloneCourseCurriculumSection {
  id: string;
  title: string;
  order: number;
  /** Published-lesson count only. */
  lessonCount: number;
}
