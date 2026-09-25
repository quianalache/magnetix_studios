import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { ensurePersonIdentity } from "@/lib/server/person-identity-service";
import {
  enrollInAgencyStandaloneCourseServerSide,
  getAgencyStandaloneCourse,
  revokeLinkedAgencyCommunityAccessServerSide,
} from "@/lib/server/agency-standalone-course-service";
import { hasPaidAgencyStandaloneCourse } from "@/lib/server/agency-standalone-course-purchase-service";
import { hasActiveComplimentaryAccess } from "@/lib/standalone-courses/complimentary";

/**
 * Complimentary access to AGENCY Standalone Courses (owner-approved
 * 2026-09-25) — the agency-scope sibling of the Contact profile's
 * complimentary course grant (contact-access-service.ts). Same entitlement
 * rule, not a second engine: the grant is the shared `complimentaryAccess`
 * field on the enrollment (keyed by the global Person id, as every agency
 * enrollment is) and `hasActiveComplimentaryAccess` is what the agency
 * classroom guard reads.
 *
 * Identity: the learner is resolved by email through `ensurePersonIdentity`
 * — exactly how Agency Community's owner "add member" resolves people —
 * never a new, course-only identity. Agency scope has no Contact records
 * or per-person activity timeline; the grant/revoke audit (who, when)
 * lives on the enrollment's `complimentaryAccess` block.
 *
 * Never writes a purchase, never charges, never changes a price, and never
 * touches an existing purchase. Revoking only ends the grant: a paid
 * purchase keeps access (and the agency communities the course links to).
 */

export class AgencyComplimentaryError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function enrollmentsCol(agencyId: string, courseId: string) {
  return getAdminDb().collection(`agencies/${agencyId}/standaloneCourses/${courseId}/enrollments`);
}

export interface AgencyComplimentaryGrantView {
  personId: string;
  email: string;
  displayName: string | null;
  grantedAt: string | null;
  alsoPaid: boolean;
}

function iso(v: unknown): string | null {
  const d = (v as { toDate?: () => Date } | null)?.toDate?.();
  return d ? d.toISOString() : null;
}

export async function listAgencyCourseComplimentaryGrants(
  agencyId: string,
  courseId: string,
): Promise<AgencyComplimentaryGrantView[]> {
  const snap = await enrollmentsCol(agencyId, courseId)
    .where("complimentaryAccess.status", "==", "active")
    .get();
  const people = snap.empty
    ? []
    : await getAdminDb().getAll(...snap.docs.map((d) => getAdminDb().doc(`people/${d.id}`)));
  const personById = new Map(people.map((p) => [p.id, p.data() ?? {}]));
  const rows = await Promise.all(
    snap.docs.map(async (d) => ({
      personId: d.id,
      email: (personById.get(d.id)?.primaryEmail as string | undefined) ?? "",
      displayName: (personById.get(d.id)?.displayName as string | undefined) ?? null,
      grantedAt: iso(d.get("complimentaryAccess.grantedAt")),
      alsoPaid: await hasPaidAgencyStandaloneCourse(agencyId, courseId, d.id),
    })),
  );
  return rows.sort((a, b) => a.email.localeCompare(b.email));
}

export async function grantAgencyCourseComplimentaryAccess(opts: {
  agencyId: string;
  courseId: string;
  email: string;
  displayName?: string | null;
  staffUid: string;
}): Promise<{ status: "granted" | "already" | "enrolled"; message: string; personId: string }> {
  const email = opts.email.trim().toLowerCase();
  if (!EMAIL_RE.test(email)) throw new AgencyComplimentaryError("Enter a valid email address.", 400);
  const course = await getAgencyStandaloneCourse(opts.agencyId, opts.courseId);
  if (!course) throw new AgencyComplimentaryError("That course no longer exists.", 404);
  if (!course.published) {
    throw new AgencyComplimentaryError("Publish this course before granting access.", 400);
  }

  const personId = await ensurePersonIdentity(email);
  const enroll = () =>
    enrollInAgencyStandaloneCourseServerSide({
      agencyId: opts.agencyId,
      courseId: opts.courseId,
      personId,
      email,
      displayName: opts.displayName?.trim() || null,
    });

  // Open course: anyone can enroll, so the grant IS an enrollment — same as
  // the tenant side (nothing to revoke).
  if (course.access !== "purchase") {
    await enroll();
    return { status: "enrolled", message: `Enrolled ${email} in "${course.title}".`, personId };
  }

  const ref = enrollmentsCol(opts.agencyId, opts.courseId).doc(personId);
  const before = await ref.get();
  if (before.exists && hasActiveComplimentaryAccess(before.data())) {
    return { status: "already", message: `${email} already has complimentary access.`, personId };
  }
  // Creates the enrollment if missing (+ the course's linked agency
  // communities, exactly as a purchase would) — idempotent.
  await enroll();
  const granted = await getAdminDb().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new AgencyComplimentaryError("Enrollment couldn't be created — try again.", 500);
    if (hasActiveComplimentaryAccess(snap.data())) return false;
    tx.update(ref, {
      complimentaryAccess: {
        status: "active",
        grantedByUid: opts.staffUid,
        grantedAt: FieldValue.serverTimestamp(),
        revokedByUid: null,
        revokedAt: null,
        contactId: null,
      },
    });
    return true;
  });
  if (!granted) {
    return { status: "already", message: `${email} already has complimentary access.`, personId };
  }
  const alsoPaid = await hasPaidAgencyStandaloneCourse(opts.agencyId, opts.courseId, personId);
  return {
    status: "granted",
    message: alsoPaid
      ? `Granted ${email} complimentary access. Their paid access is unchanged.`
      : `Granted ${email} complimentary access to "${course.title}".`,
    personId,
  };
}

export async function revokeAgencyCourseComplimentaryAccess(opts: {
  agencyId: string;
  courseId: string;
  personId: string;
  staffUid: string;
}): Promise<{ message: string; accessRetained: boolean }> {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(opts.personId)) {
    throw new AgencyComplimentaryError("Unknown person.", 400);
  }
  const ref = enrollmentsCol(opts.agencyId, opts.courseId).doc(opts.personId);
  const revoked = await getAdminDb().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists || !hasActiveComplimentaryAccess(snap.data())) return false;
    tx.update(ref, {
      "complimentaryAccess.status": "revoked",
      "complimentaryAccess.revokedAt": FieldValue.serverTimestamp(),
      "complimentaryAccess.revokedByUid": opts.staffUid,
    });
    return true;
  });
  if (!revoked) {
    throw new AgencyComplimentaryError(
      "There's no complimentary grant to revoke here — this access comes from somewhere else.",
      409,
    );
  }
  const paid = await hasPaidAgencyStandaloneCourse(opts.agencyId, opts.courseId, opts.personId);
  if (!paid) {
    // Grant is now revoked, so this proceeds — and still only ever removes
    // a roster entry whose only reason to exist was this course.
    await revokeLinkedAgencyCommunityAccessServerSide({
      agencyId: opts.agencyId,
      courseId: opts.courseId,
      personId: opts.personId,
    });
  }
  return {
    message: paid
      ? "Complimentary grant removed. They keep access through their paid purchase."
      : "Complimentary access revoked. Their progress is kept if access is granted again.",
    accessRetained: paid,
  };
}
