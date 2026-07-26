import "server-only";

import {
  getStandaloneCoursesGate,
  type StandaloneCoursesGate,
} from "@/lib/standalone-courses/gate";
import { getCurrentMember } from "@/lib/community/member-session";
import {
  getStandaloneCourse,
  getStandaloneEnrollment,
} from "@/lib/server/standalone-course-service";
import { hasPaidStandaloneCourse } from "@/lib/server/standalone-course-purchase-service";
import type { Member } from "@/types/community";
import type { StandaloneCourse } from "@/types/standalone-courses";

/** Timestamp-ish value read off a Firestore doc — Admin SDK Timestamp or a
 *  plain Date, depending on the read path. */
function toDateOrNull(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof (value as { toDate?: () => Date }).toDate === "function") {
    return (value as { toDate: () => Date }).toDate();
  }
  return null;
}

/**
 * Resolve access to a standalone course's public surfaces, mirroring
 * `src/lib/community/member-context.ts` but WITHOUT any group/membership
 * concept — a standalone course has no group to join. The sales page itself
 * is public (viewable without a session); a session is only required to
 * enroll/watch.
 */
export interface CoursePageAccessOk {
  kind: "ok";
  gate: StandaloneCoursesGate;
  course: StandaloneCourse;
  /** Null when the visitor isn't signed in — the sales page still renders. */
  member: Member | null;
}

export type CoursePageAccess =
  | CoursePageAccessOk
  | { kind: "notFound" };

export async function requireCoursePageAccess(
  saId: string,
  courseId: string,
): Promise<CoursePageAccess> {
  const gate = await getStandaloneCoursesGate(saId);
  if (!gate || !gate.enabled) return { kind: "notFound" };

  const course = await getStandaloneCourse(saId, courseId);
  if (!course || !course.published) return { kind: "notFound" };

  const member = await getCurrentMember(saId);
  return { kind: "ok", gate, course, member };
}

export type CourseClassroomAccess =
  | { kind: "ok"; gate: StandaloneCoursesGate; course: StandaloneCourse; member: Member }
  | { kind: "notFound" }
  | { kind: "redirect"; to: string };

/**
 * Stricter guard for the actual lesson player — requires an active member
 * session (even for free/"open" courses, per product requirement: every
 * enrollment must capture contact info) and, for paid courses, a completed
 * purchase.
 */
export async function requireCourseClassroomAccess(
  saId: string,
  courseId: string,
): Promise<CourseClassroomAccess> {
  const gate = await getStandaloneCoursesGate(saId);
  if (!gate || !gate.enabled) return { kind: "notFound" };

  const course = await getStandaloneCourse(saId, courseId);
  if (!course || !course.published) return { kind: "notFound" };

  const member = await getCurrentMember(saId);
  if (!member) {
    return {
      kind: "redirect",
      to: `/course/${saId}/login?course=${courseId}`,
    };
  }

  if (course.access === "purchase") {
    const paid = await hasPaidStandaloneCourse(saId, courseId, member.id);
    if (!paid) {
      return { kind: "redirect", to: `/course/${saId}/${courseId}` };
    }
  }

  // Offer Access rules (Course Offers feature) — a course granted via an
  // Offer with a "begin at date" or "restrict to N days" rule stamps the
  // enrollment with an access window. Most enrollments have neither field
  // set and are unaffected.
  const enrollment = await getStandaloneEnrollment(saId, courseId, member.id);
  const beginsAt = toDateOrNull(enrollment?.accessBeginsAt);
  const expiresAt = toDateOrNull(enrollment?.accessExpiresAt);
  const now = new Date();
  if ((beginsAt && now < beginsAt) || (expiresAt && now > expiresAt)) {
    return { kind: "redirect", to: `/course/${saId}/${courseId}` };
  }

  return { kind: "ok", gate, course, member };
}

/** API-route variant of the classroom guard — structured errors, no redirects. */
export type CourseApiAccess =
  | { kind: "ok"; gate: StandaloneCoursesGate; course: StandaloneCourse; member: Member }
  | { kind: "error"; status: number; message: string };

export async function requireCourseApiAccess(
  saId: string,
  courseId: string,
): Promise<CourseApiAccess> {
  const gate = await getStandaloneCoursesGate(saId);
  if (!gate || !gate.enabled) {
    return { kind: "error", status: 404, message: "Not found" };
  }
  const course = await getStandaloneCourse(saId, courseId);
  if (!course || !course.published) {
    return { kind: "error", status: 404, message: "Course not found" };
  }
  const member = await getCurrentMember(saId);
  if (!member) {
    return { kind: "error", status: 401, message: "Sign in first" };
  }
  return { kind: "ok", gate, course, member };
}
