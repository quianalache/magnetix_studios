import type { Timestamp, FieldValue } from "firebase/firestore";
import type { VideoProvider, ResourceLink } from "./community";

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
  /** One-time price (cents) when `access === "purchase"`. */
  priceCents: number | null;
  currency: string | null;
  /** Denormalized count of enrolled members, for the sales-page stat. */
  enrollmentCount: number;
  published: boolean;
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
}

/**
 * A one-time PayPal purchase for a standalone course, at
 * `standaloneCourses/{courseId}/purchases/{purchaseId}`. Simpler than
 * Community's Purchase — no `scope`/`targetId` discriminator needed since
 * every purchase here IS a course purchase. v1 is manual-reconcile (staff
 * marks paid), same as every other PayPal.me flow in this codebase.
 */
export type StandaloneCoursePurchaseStatus = "pending" | "paid" | "void";

export interface StandaloneCoursePurchase {
  id: string;
  subAccountId: string;
  agencyId: string;
  courseId: string;
  memberId: string;
  amountCents: number;
  currency: string;
  paypalUrl: string;
  status: StandaloneCoursePurchaseStatus;
  grantedByUid: string | null;
  requestedAt: Timestamp | FieldValue | null;
  paidAt: Timestamp | FieldValue | null;
}

/** A curriculum-outline entry for the public sales page (summary only, no lesson links). */
export interface StandaloneCourseCurriculumSection {
  id: string;
  title: string;
  order: number;
  /** Published-lesson count only. */
  lessonCount: number;
}
