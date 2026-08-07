import "server-only";

import { getAdminDb } from "@/lib/firebase/admin";
import { getStandaloneCourse } from "@/lib/server/standalone-course-service";
import { listProjectsForContact, listSteps } from "@/lib/server/project-service";
import type { StandaloneEnrollment } from "@/types/standalone-courses";
import type { EnergeticDecoderReading } from "@/types/energetic-decoder";
import { eventStatus, type CalendarEvent } from "@/types/events";
import type { Quote } from "@/types/quotes";
import type { Project, ProjectStep } from "@/types/projects";

/**
 * Client Portal MVP data aggregation — one login, everything a Contact has
 * with this sub-account in one place. Every query below is server-side
 * (Admin SDK), keyed off `member.contactId` (courses) or a mix of
 * memberId/contactId (see each function) — no Firestore rules needed for
 * these collections since the portal page itself is a Server Component.
 */

export interface PortalCourse {
  courseId: string;
  title: string;
  coverUrl: string | null;
  progressPct: number;
  salesPageHref: string;
  classroomHref: string;
}

/** Every Standalone Course this member is enrolled in, across the sub-account — not scoped to one community group. */
export async function listPortalCourses(
  subAccountId: string,
  memberId: string,
): Promise<PortalCourse[]> {
  const db = getAdminDb();
  const snap = await db
    .collectionGroup("enrollments")
    .where("memberId", "==", memberId)
    .get();

  const enrollments = snap.docs
    .map((d) => d.data() as StandaloneEnrollment)
    // A member's enrollments collection-group spans every sub-account they
    // belong to (rare, but the doc path alone doesn't scope this query) —
    // filter to this sub-account's own courses via a parent-path check.
    .filter((_, i) => snap.docs[i].ref.path.startsWith(`subAccounts/${subAccountId}/`));

  const courses = await Promise.all(
    enrollments.map(async (e) => {
      const course = await getStandaloneCourse(subAccountId, e.courseId);
      if (!course) return null;
      const result: PortalCourse = {
        courseId: course.id,
        title: course.title,
        coverUrl: course.coverUrl,
        progressPct: e.progressPct,
        salesPageHref: `/course/${subAccountId}/${course.id}`,
        classroomHref: `/course/${subAccountId}/${course.id}/classroom`,
      };
      return result;
    }),
  );
  return courses.filter((c): c is PortalCourse => c !== null);
}

/** This contact's saved Energetic Decoder readings — reusing the same query shape as the Contact profile's own section. */
export async function listPortalReadings(
  subAccountId: string,
  contactId: string,
): Promise<EnergeticDecoderReading[]> {
  const snap = await getAdminDb()
    .collection("energeticDecoderReadings")
    .where("subAccountId", "==", subAccountId)
    .where("contactId", "==", contactId)
    .get();
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }) as EnergeticDecoderReading)
    .sort((a, b) => tsMillis(b.createdAt) - tsMillis(a.createdAt));
}

export interface PortalBooking {
  id: string;
  title: string;
  startAt: Date | null;
}

/** This contact's upcoming (not past, not cancelled) booked events. */
export async function listPortalUpcomingBookings(
  subAccountId: string,
  contactId: string,
): Promise<PortalBooking[]> {
  const snap = await getAdminDb()
    .collection("events")
    .where("subAccountId", "==", subAccountId)
    .where("contactId", "==", contactId)
    .get();

  const now = Date.now();
  return snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as Omit<CalendarEvent, "id">) }))
    .filter((e) => eventStatus(e) !== "cancelled" && eventStatus(e) !== "completed")
    .map((e) => ({ id: e.id, title: e.title, startAt: tsToDate(e.startAt) }))
    .filter((e) => e.startAt !== null && e.startAt.getTime() >= now)
    .sort((a, b) => (a.startAt?.getTime() ?? 0) - (b.startAt?.getTime() ?? 0));
}

/** This contact's quotes + invoices (both stored as Quote docs, discriminated by `kind`). */
export async function listPortalQuotes(
  subAccountId: string,
  contactId: string,
): Promise<Quote[]> {
  const snap = await getAdminDb()
    .collection("quotes")
    .where("subAccountId", "==", subAccountId)
    .where("contactId", "==", contactId)
    .get();
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }) as Quote)
    .sort((a, b) => tsMillis(b.createdAt) - tsMillis(a.createdAt));
}

/** This contact's projects (coach-assigned or self-started), each with its steps attached — the Client Portal's "Your projects" section. */
export async function listPortalProjects(
  subAccountId: string,
  contactId: string,
): Promise<(Project & { steps: ProjectStep[] })[]> {
  const projects = await listProjectsForContact(subAccountId, contactId);
  const active = projects
    .filter((p) => p.status === "active")
    .sort((a, b) => tsMillis(b.updatedAt) - tsMillis(a.updatedAt));
  return Promise.all(
    active.map(async (p) => ({ ...p, steps: await listSteps(p.id) })),
  );
}

function tsToDate(v: unknown): Date | null {
  if (v && typeof (v as { toDate?: () => Date }).toDate === "function") {
    return (v as { toDate: () => Date }).toDate();
  }
  return null;
}
function tsMillis(v: unknown): number {
  return tsToDate(v)?.getTime() ?? 0;
}
