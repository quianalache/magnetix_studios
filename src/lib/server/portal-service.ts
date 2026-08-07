import "server-only";

import { getAdminDb } from "@/lib/firebase/admin";
import { getStandaloneCourse } from "@/lib/server/standalone-course-service";
import { listProjectsForContact, listSteps } from "@/lib/server/project-service";
import type { StandaloneEnrollment } from "@/types/standalone-courses";
import type { EnergeticDecoderReading } from "@/types/energetic-decoder";
import { eventStatus, type CalendarEvent } from "@/types/events";
import type { Quote } from "@/types/quotes";
import type { Project, ProjectStep } from "@/types/projects";
import type { CourseOfferPurchase } from "@/types/course-offers";

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

export interface PortalSessionBundle {
  bookingPageSlug: string;
  bookingPageName: string;
  total: number;
  used: number;
  remaining: number;
}

/**
 * Real session-count tracking for the portal's Sessions module — replaces
 * the mockup's typed-in "0 of 1 / 1 of 3" numbers with actual purchase +
 * booking data. Sessions, not "credits" — there's no separate token/credit
 * system in this CRM, this is purely "how many sessions did the purchased
 * bundle include vs. how many has this person actually booked." `total`
 * comes from every paid Course Offer purchase's
 * snapshotted booking bundle (`CourseOfferBookingBundle.sessionCount`);
 * `used` counts this member's non-cancelled events sourced from that same
 * booking page.
 *
 * One known limitation, called out rather than hidden: if a member buys
 * the SAME bundle (same booking page) more than once, their usage is
 * summed across both purchases rather than tracked per-purchase, since
 * booked events aren't tagged with which purchase redeemed them — good
 * enough for the common one-bundle-at-a-time case, worth revisiting if
 * repeat purchases of the same bundle turn out to be common.
 */
export async function listPortalSessionBundles(
  subAccountId: string,
  memberId: string,
  contactId: string | null,
): Promise<PortalSessionBundle[]> {
  const purchaseSnap = await getAdminDb()
    .collectionGroup("purchases")
    .where("subAccountId", "==", subAccountId)
    .where("memberId", "==", memberId)
    .where("status", "==", "paid")
    .get();

  const byPage = new Map<string, { name: string; total: number }>();
  for (const doc of purchaseSnap.docs) {
    // The Community group "purchases" subcollection shares the same
    // collection id — this collectionGroup query legitimately returns both.
    // Only Course Offer purchases have a `booking` bundle; everything else
    // (including Community's, which has no such field) is skipped here.
    const data = doc.data() as Partial<CourseOfferPurchase>;
    if (!data.booking) continue;
    const key = data.booking.bookingPageSlug;
    const existing = byPage.get(key);
    byPage.set(key, {
      name: data.booking.bookingPageName,
      total: (existing?.total ?? 0) + data.booking.sessionCount,
    });
  }
  if (byPage.size === 0 || !contactId) return [];

  const eventSnap = await getAdminDb()
    .collection("events")
    .where("subAccountId", "==", subAccountId)
    .where("contactId", "==", contactId)
    .get();
  const usedByPage = new Map<string, number>();
  for (const doc of eventSnap.docs) {
    const e = doc.data() as Omit<CalendarEvent, "id">;
    if (!e.bookingPageSlug || !byPage.has(e.bookingPageSlug)) continue;
    if (eventStatus(e) === "cancelled") continue;
    usedByPage.set(e.bookingPageSlug, (usedByPage.get(e.bookingPageSlug) ?? 0) + 1);
  }

  return [...byPage.entries()].map(([slug, { name, total }]) => {
    const used = Math.min(total, usedByPage.get(slug) ?? 0);
    return { bookingPageSlug: slug, bookingPageName: name, total, used, remaining: total - used };
  });
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
