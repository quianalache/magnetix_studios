import "server-only";

import {
  listCoursesForMember,
  formatPrice,
} from "@/lib/server/community-classroom-service";
import {
  getStandaloneCourseTree,
  getStandaloneEnrollment,
  listStandaloneCoursesLinkedToGroup,
} from "@/lib/server/standalone-course-service";
import { hasPaidStandaloneCourse } from "@/lib/server/standalone-course-purchase-service";
import { getStandaloneCoursesGate } from "@/lib/standalone-courses/gate";
import { checkStandaloneCourseEntitlementForMember } from "@/lib/standalone-courses/course-access";
import {
  communityLearningLessonHref,
  communityLearningProductLessonHref,
  type CommunityLinkBase,
} from "@/lib/community/routes";
import type { GroupMembership } from "@/types/community";

/**
 * Community Classroom's combined catalog — native Community Courses
 * (`communityGroups/{groupId}/courses`) union linked Standalone Products
 * (`standaloneCourses` where `linkedCommunityGroupIds array-contains
 * groupId`), normalized into one card shape both the staff and
 * member-facing Classroom pages render identically.
 *
 * Architecture: see the canonical-course-architecture audit. The short
 * version — a linked Standalone Product is NEVER copied into
 * `communityGroups/{groupId}/courses`; this module only READS it from its
 * one canonical home and adapts the view. Content, entitlement
 * (`hasPaidStandaloneCourse`/access-window), and progress
 * (`standaloneCourses/{courseId}/enrollments/{memberId}`) all stay exactly
 * where they already lived — Community membership plays no part in
 * whether a linked Product unlocks; that's still purely product
 * entitlement, same as anywhere else in the app.
 */

export type ClassroomCourseSource = "native" | "standalone";

export interface ClassroomCourseCard {
  id: string;
  source: ClassroomCourseSource;
  title: string;
  /** Empty for a linked Standalone Product — its `aboutHtml` is rich text,
   *  not a plain-text snippet this card's markup expects, and forcing one
   *  isn't worth inventing an HTML-stripping step for. Falls back to the
   *  same "N lessons" line the card already shows for an empty description
   *  on a native course. */
  description: string;
  thumbnailUrl: string | null;
  lessonCount: number;
  progressPct: number;
  locked: { reason: string; purchasable: boolean } | null;
  /** Fully-formed, source-aware destination — native goes to the Community
   *  lesson route, standalone goes to the Standalone Course's own
   *  classroom/sales page. Null when the card isn't clickable (locked +
   *  not purchasable, or a native course with no published lessons yet) —
   *  same "render as an inert card" contract the pre-existing native-only
   *  pages already used via `c.locked || !c.firstLessonId`. */
  href: string | null;
}

export async function listClassroomCatalogForMember(opts: {
  linkBase: CommunityLinkBase;
  groupId: string;
  groupSlug: string;
  memberId: string;
  membership: GroupMembership;
}): Promise<ClassroomCourseCard[]> {
  const saId = opts.linkBase.saId;

  const native = await listCoursesForMember({
    subAccountId: saId,
    groupId: opts.groupId,
    memberId: opts.memberId,
    membership: opts.membership,
  });
  const nativeCards: ClassroomCourseCard[] = native.map((c) => ({
    id: c.id,
    source: "native",
    title: c.title,
    description: c.description,
    thumbnailUrl: c.thumbnailUrl,
    lessonCount: c.lessonCount,
    progressPct: c.progressPct,
    locked: c.locked,
    href:
      c.locked || !c.firstLessonId
        ? null
        : communityLearningLessonHref(
            opts.linkBase,
            opts.groupSlug,
            c.id,
            c.firstLessonId
          ),
  }));

  // Standalone Courses is a togglable feature (`standaloneCoursesEnabledByAgency`)
  // independent of any existing link — if it's off, degrade to native-only
  // rather than surfacing content from a disabled feature.
  const gate = await getStandaloneCoursesGate(saId);
  if (!gate?.enabled) return nativeCards;

  const linkedCourses = await listStandaloneCoursesLinkedToGroup(
    saId,
    opts.groupId
  );
  const standaloneCards: ClassroomCourseCard[] = await Promise.all(
    linkedCourses.map(async (course) => {
      const [tree, enrollment] = await Promise.all([
        getStandaloneCourseTree({
          subAccountId: saId,
          courseId: course.id,
          includeUnpublished: false,
        }),
        getStandaloneEnrollment(saId, course.id, opts.memberId),
      ]);
      const lessonCount = tree?.lessons.length ?? 0;

      let locked: { reason: string; purchasable: boolean } | null = null;
      if (course.access === "purchase") {
        const paid = await hasPaidStandaloneCourse(
          saId,
          course.id,
          opts.memberId
        );
        if (!paid) {
          const price =
            course.priceCents != null
              ? ` — ${formatPrice(course.priceCents, course.currency)}`
              : "";
          locked = { reason: `Buy${price}`, purchasable: true };
        }
      }
      // Offer Access rules (begin-at-date / restrict-to-N-days) — reuses
      // the same shared check the actual embedded lesson route enforces
      // (checkStandaloneCourseEntitlementForMember), rather than a second
      // copy of the date-window logic, so a not-yet-begun or expired
      // window shows correctly here instead of a false "unlocked". A
      // purchase-lock above already short-circuits this — no need to
      // re-derive the same "not paid" verdict twice.
      if (!locked) {
        const entitled = await checkStandaloneCourseEntitlementForMember(
          course,
          opts.memberId
        );
        if (!entitled) {
          locked = { reason: "Access unavailable", purchasable: false };
        }
      }

      const salesHref = `/course/${saId}/${course.id}`;
      const firstLessonId = tree?.lessons[0]?.id ?? null;
      // Entitled -> the Community-embedded lesson experience (stays inside
      // this group's shell); locked+purchasable -> the Product's own
      // public sales page, its existing purchase destination.
      const unlockedHref = firstLessonId
        ? communityLearningProductLessonHref(
            opts.linkBase,
            opts.groupSlug,
            course.id,
            firstLessonId
          )
        : null;

      return {
        id: course.id,
        source: "standalone" as const,
        title: course.title,
        description: "",
        thumbnailUrl: course.coverUrl,
        lessonCount,
        progressPct: enrollment?.progressPct ?? 0,
        locked,
        href: locked ? (locked.purchasable ? salesHref : null) : unlockedHref,
      };
    })
  );

  // Native courses keep their existing Classroom Builder `order`. Standalone
  // Products have no Community-specific order (their own `createdAt`/course-
  // list order is a different context entirely), so — smallest deterministic
  // choice, not a new ordering system — they're appended after every native
  // course, sorted by title for a stable secondary order.
  standaloneCards.sort((a, b) => a.title.localeCompare(b.title));
  return [...nativeCards, ...standaloneCards];
}
