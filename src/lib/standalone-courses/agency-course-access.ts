import "server-only";

import { resolveFirstAgencyId } from "@/lib/landing/resolve-brand";
import { getCurrentPerson, type CurrentPerson } from "@/lib/server/person-session";
import {
  getAgencyStandaloneCourse,
  getAgencyStandaloneEnrollment,
} from "@/lib/server/agency-standalone-course-service";
import { hasPaidAgencyStandaloneCourse } from "@/lib/server/agency-standalone-course-purchase-service";
import type { StandaloneCourse } from "@/types/standalone-courses";

/**
 * Resolve access to an Agency Standalone Course's public surfaces — the
 * agency-scope sibling of course-access.ts. Uses the global Person/
 * MyMagnetix identity (`mm_session`) instead of a tenant Member session —
 * per the explicit "no fake tenant Members" instruction, a buyer here is
 * the SAME Person who might also belong to Agency Community, never a
 * second, course-only identity.
 */

/** Timestamp-ish value read off a Firestore doc. */
function toDateOrNull(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof (value as { toDate?: () => Date }).toDate === "function") {
    return (value as { toDate: () => Date }).toDate();
  }
  return null;
}

export interface AgencyCoursePageAccessOk {
  kind: "ok";
  agencyId: string;
  course: StandaloneCourse;
  /** Null when the visitor isn't signed in — the sales page still renders. */
  person: CurrentPerson | null;
}
export type AgencyCoursePageAccess = AgencyCoursePageAccessOk | { kind: "notFound" };

export async function requireAgencyCoursePageAccess(courseId: string): Promise<AgencyCoursePageAccess> {
  const agencyId = await resolveFirstAgencyId();
  if (!agencyId) return { kind: "notFound" };
  const course = await getAgencyStandaloneCourse(agencyId, courseId);
  if (!course || !course.published) return { kind: "notFound" };
  const person = await getCurrentPerson();
  return { kind: "ok", agencyId, course, person };
}

export async function checkAgencyCourseEntitlementForPerson(agencyId: string, course: StandaloneCourse, personId: string): Promise<boolean> {
  if (course.access === "purchase") {
    const paid = await hasPaidAgencyStandaloneCourse(agencyId, course.id, personId);
    if (!paid) return false;
  }
  const enrollment = await getAgencyStandaloneEnrollment(agencyId, course.id, personId);
  const beginsAt = toDateOrNull(enrollment?.accessBeginsAt);
  const expiresAt = toDateOrNull(enrollment?.accessExpiresAt);
  const now = new Date();
  if ((beginsAt && now < beginsAt) || (expiresAt && now > expiresAt)) return false;
  return true;
}

export type AgencyCourseClassroomAccess =
  | { kind: "ok"; agencyId: string; course: StandaloneCourse; person: CurrentPerson }
  | { kind: "notFound" }
  | { kind: "redirect"; to: string };

export async function requireAgencyCourseClassroomAccess(courseId: string): Promise<AgencyCourseClassroomAccess> {
  const agencyId = await resolveFirstAgencyId();
  if (!agencyId) return { kind: "notFound" };
  const course = await getAgencyStandaloneCourse(agencyId, courseId);
  if (!course || !course.published) return { kind: "notFound" };

  const person = await getCurrentPerson();
  if (!person) {
    return { kind: "redirect", to: `/my/login?next=${encodeURIComponent(`/course/agency/${courseId}/classroom`)}` };
  }
  const entitled = await checkAgencyCourseEntitlementForPerson(agencyId, course, person.id);
  if (!entitled) return { kind: "redirect", to: `/course/agency/${courseId}` };
  return { kind: "ok", agencyId, course, person };
}

export type AgencyCourseApiAccess =
  | { kind: "ok"; agencyId: string; course: StandaloneCourse; person: CurrentPerson }
  | { kind: "error"; status: number; message: string };

export async function requireAgencyCourseApiAccess(courseId: string): Promise<AgencyCourseApiAccess> {
  const agencyId = await resolveFirstAgencyId();
  if (!agencyId) return { kind: "error", status: 404, message: "Not found" };
  const course = await getAgencyStandaloneCourse(agencyId, courseId);
  if (!course || !course.published) return { kind: "error", status: 404, message: "Course not found" };
  const person = await getCurrentPerson();
  if (!person) return { kind: "error", status: 401, message: "Sign in first" };
  return { kind: "ok", agencyId, course, person };
}
