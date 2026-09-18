import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { parseVideoUrl } from "@/lib/community/video-embed";
import { formatPrice } from "@/lib/server/community-classroom-service";
import { communityLearningLessonHref, type CommunityLinkBase } from "@/lib/community/routes";
import type {
  Course,
  CourseAccess,
  CourseCardView,
  CourseSection,
  Enrollment,
  Lesson,
  ResourceLink,
} from "@/types/community";

/**
 * Agency Community Classroom — the agency-scope sibling of
 * community-classroom-service.ts, rooted at `agencies/{agencyId}/
 * communityGroups/{groupId}/courses`. Algorithms transfer verbatim
 * (courses/sections/lessons/enrollments are the same shape one level up);
 * two real differences:
 *  - No CRM webhook/workflow emission on lesson/course completion — those
 *    are sub-account CRM automation systems with no agency analog (same
 *    "Contact-based automation has no agency analog" reasoning as DMs).
 *  - `access: "purchase"` has no working unlock path yet — Agency
 *    Community has no payment-collection mechanism of its own (tenant's
 *    "purchase" course unlock is itself only a manual PayPal.me + staff
 *    "mark paid" reconcile against the SUB-ACCOUNT's `paypalConfig`,
 *    which has no agency-level equivalent — `AgencyDoc` carries only the
 *    platform's own SaaS billing, not a mechanism for the agency to
 *    collect payment from ITS OWN members). A course set to "purchase"
 *    stays genuinely, permanently locked with a price hint — never
 *    silently unlocked, never a fake buy button. Real, disclosed gap.
 */

function coursesCol(agencyId: string, groupId: string) {
  return getAdminDb().collection(`agencies/${agencyId}/communityGroups/${groupId}/courses`);
}
function courseDoc(agencyId: string, groupId: string, courseId: string) {
  return coursesCol(agencyId, groupId).doc(courseId);
}

/* ------------------------------- Courses ------------------------------- */

export async function createAgencyCourseServerSide(opts: {
  agencyId: string;
  groupId: string;
  title: string;
  description?: string;
  thumbnailUrl?: string | null;
  access?: CourseAccess;
  requiredLevel?: number | null;
  priceCents?: number | null;
  currency?: string | null;
  published?: boolean;
}): Promise<Course> {
  const col = coursesCol(opts.agencyId, opts.groupId);
  const count = (await col.count().get()).data().count;
  const access: CourseAccess = opts.access ?? "open";
  const doc = {
    agencyId: opts.agencyId,
    groupId: opts.groupId,
    title: opts.title.trim(),
    description: opts.description?.trim() ?? "",
    thumbnailUrl: opts.thumbnailUrl ?? null,
    order: count,
    published: opts.published ?? false,
    access,
    requiredLevel: access === "level" ? (opts.requiredLevel ?? 2) : null,
    priceCents: access === "purchase" ? (opts.priceCents ?? null) : null,
    currency: access === "purchase" ? (opts.currency ?? "USD") : null,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };
  const ref = await col.add(doc);
  return { id: ref.id, ...doc } as unknown as Course;
}

export interface AgencyCoursePatch {
  title?: string;
  description?: string;
  thumbnailUrl?: string | null;
  published?: boolean;
  order?: number;
  access?: CourseAccess;
  requiredLevel?: number | null;
  priceCents?: number | null;
  currency?: string | null;
}

export async function updateAgencyCourseServerSide(opts: {
  agencyId: string;
  groupId: string;
  courseId: string;
  patch: AgencyCoursePatch;
}): Promise<void> {
  const updates: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
  const p = opts.patch;
  if (typeof p.title === "string") updates.title = p.title.trim();
  if (typeof p.description === "string") updates.description = p.description.trim();
  if (p.thumbnailUrl !== undefined) updates.thumbnailUrl = p.thumbnailUrl;
  if (typeof p.published === "boolean") updates.published = p.published;
  if (typeof p.order === "number") updates.order = p.order;
  if (p.access) {
    updates.access = p.access;
    updates.requiredLevel = p.access === "level" ? (p.requiredLevel ?? 2) : null;
    if (p.access === "purchase") {
      if (p.priceCents !== undefined) updates.priceCents = p.priceCents;
      updates.currency = p.currency ?? "USD";
    } else {
      updates.priceCents = null;
      updates.currency = null;
    }
  } else {
    if (p.requiredLevel !== undefined) updates.requiredLevel = p.requiredLevel;
    if (p.priceCents !== undefined) updates.priceCents = p.priceCents;
  }
  await courseDoc(opts.agencyId, opts.groupId, opts.courseId).update(updates);
}

export async function deleteAgencyCourseServerSide(opts: {
  agencyId: string;
  groupId: string;
  courseId: string;
}): Promise<void> {
  await getAdminDb().recursiveDelete(courseDoc(opts.agencyId, opts.groupId, opts.courseId));
}

export async function getAgencyCourse(agencyId: string, groupId: string, courseId: string): Promise<Course | null> {
  const snap = await courseDoc(agencyId, groupId, courseId).get();
  if (!snap.exists) return null;
  return { id: snap.id, ...(snap.data() as Omit<Course, "id">) };
}

export async function listAgencyCourses(agencyId: string, groupId: string): Promise<Course[]> {
  const snap = await coursesCol(agencyId, groupId).orderBy("order", "asc").get();
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Course, "id">) }));
}

/* ------------------------------ Sections ------------------------------- */

export async function createAgencySectionServerSide(opts: {
  agencyId: string;
  groupId: string;
  courseId: string;
  title: string;
}): Promise<CourseSection> {
  const col = courseDoc(opts.agencyId, opts.groupId, opts.courseId).collection("sections");
  const count = (await col.count().get()).data().count;
  const doc = { title: opts.title.trim() || "Untitled section", order: count };
  const ref = await col.add(doc);
  return { id: ref.id, ...doc };
}

export async function updateAgencySectionServerSide(opts: {
  agencyId: string;
  groupId: string;
  courseId: string;
  sectionId: string;
  patch: { title?: string; order?: number };
}): Promise<void> {
  const updates: Record<string, unknown> = {};
  if (typeof opts.patch.title === "string") updates.title = opts.patch.title.trim();
  if (typeof opts.patch.order === "number") updates.order = opts.patch.order;
  await courseDoc(opts.agencyId, opts.groupId, opts.courseId).collection("sections").doc(opts.sectionId).update(updates);
}

export async function deleteAgencySectionServerSide(opts: {
  agencyId: string;
  groupId: string;
  courseId: string;
  sectionId: string;
}): Promise<void> {
  await courseDoc(opts.agencyId, opts.groupId, opts.courseId).collection("sections").doc(opts.sectionId).delete();
}

/* ------------------------------- Lessons ------------------------------- */

function lessonsCol(agencyId: string, groupId: string, courseId: string) {
  return courseDoc(agencyId, groupId, courseId).collection("lessons");
}

export async function createAgencyLessonServerSide(opts: {
  agencyId: string;
  groupId: string;
  courseId: string;
  sectionId: string | null;
  title: string;
}): Promise<Lesson> {
  const col = lessonsCol(opts.agencyId, opts.groupId, opts.courseId);
  const count = (await col.count().get()).data().count;
  const doc = {
    sectionId: opts.sectionId,
    title: opts.title.trim() || "Untitled lesson",
    order: count,
    published: false,
    videoUrl: null,
    videoProvider: null,
    videoId: null,
    bodyHtml: "",
    resourceLinks: [] as ResourceLink[],
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };
  const ref = await col.add(doc);
  return { id: ref.id, ...doc } as unknown as Lesson;
}

export interface AgencyLessonPatch {
  title?: string;
  sectionId?: string | null;
  order?: number;
  published?: boolean;
  videoUrl?: string | null;
  bodyHtml?: string;
  resourceLinks?: ResourceLink[];
}

export async function updateAgencyLessonServerSide(opts: {
  agencyId: string;
  groupId: string;
  courseId: string;
  lessonId: string;
  patch: AgencyLessonPatch;
}): Promise<{ videoError?: boolean }> {
  const updates: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
  const p = opts.patch;
  if (typeof p.title === "string") updates.title = p.title.trim();
  if (p.sectionId !== undefined) updates.sectionId = p.sectionId;
  if (typeof p.order === "number") updates.order = p.order;
  if (typeof p.published === "boolean") updates.published = p.published;
  if (typeof p.bodyHtml === "string") updates.bodyHtml = p.bodyHtml;
  if (Array.isArray(p.resourceLinks)) {
    updates.resourceLinks = p.resourceLinks
      .filter((r) => r && r.url?.trim())
      .map((r) => ({ label: r.label?.trim() || r.url.trim(), url: r.url.trim() }))
      .slice(0, 20);
  }
  let videoError = false;
  if (p.videoUrl !== undefined) {
    if (!p.videoUrl) {
      updates.videoUrl = null;
      updates.videoProvider = null;
      updates.videoId = null;
    } else {
      const parsed = parseVideoUrl(p.videoUrl);
      if (parsed) {
        updates.videoUrl = p.videoUrl.trim();
        updates.videoProvider = parsed.provider;
        updates.videoId = parsed.id;
      } else {
        videoError = true;
      }
    }
  }
  await lessonsCol(opts.agencyId, opts.groupId, opts.courseId).doc(opts.lessonId).update(updates);
  return { videoError };
}

export async function deleteAgencyLessonServerSide(opts: {
  agencyId: string;
  groupId: string;
  courseId: string;
  lessonId: string;
}): Promise<void> {
  await getAdminDb().recursiveDelete(lessonsCol(opts.agencyId, opts.groupId, opts.courseId).doc(opts.lessonId));
}

/* --------------------------- Read: full tree --------------------------- */

export interface AgencyCourseTree {
  course: Course;
  sections: CourseSection[];
  lessons: Lesson[];
}

export async function getAgencyCourseTree(opts: {
  agencyId: string;
  groupId: string;
  courseId: string;
  includeUnpublished: boolean;
}): Promise<AgencyCourseTree | null> {
  const course = await getAgencyCourse(opts.agencyId, opts.groupId, opts.courseId);
  if (!course) return null;
  const ref = courseDoc(opts.agencyId, opts.groupId, opts.courseId);
  const [sectionsSnap, lessonsSnap] = await Promise.all([
    ref.collection("sections").orderBy("order", "asc").get(),
    ref.collection("lessons").orderBy("order", "asc").get(),
  ]);
  const sections = sectionsSnap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<CourseSection, "id">) }));
  let lessons = lessonsSnap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Lesson, "id">) }));
  if (!opts.includeUnpublished) lessons = lessons.filter((l) => l.published);
  return { course, sections, lessons };
}

/* ------------------------- Enrollment / progress ----------------------- */

function enrollmentDoc(agencyId: string, groupId: string, courseId: string, memberId: string) {
  return courseDoc(agencyId, groupId, courseId).collection("enrollments").doc(memberId);
}

export async function getAgencyEnrollment(
  agencyId: string,
  groupId: string,
  courseId: string,
  memberId: string,
): Promise<Enrollment | null> {
  const snap = await enrollmentDoc(agencyId, groupId, courseId, memberId).get();
  if (!snap.exists) return null;
  return { id: snap.id, ...(snap.data() as Omit<Enrollment, "id">) };
}

/** Idempotently mark a lesson complete + recompute progress — mirrors
 *  tenant `markLessonCompleteServerSide` exactly, minus the CRM webhook
 *  emission (no agency webhook/workflow system). */
export async function markAgencyLessonCompleteServerSide(opts: {
  agencyId: string;
  groupId: string;
  courseId: string;
  memberId: string;
  lessonId: string;
}): Promise<{ progressPct: number; completed: boolean }> {
  const ref = enrollmentDoc(opts.agencyId, opts.groupId, opts.courseId, opts.memberId);
  const publishedSnap = await lessonsCol(opts.agencyId, opts.groupId, opts.courseId).where("published", "==", true).get();
  const total = publishedSnap.size || 1;

  const snap = await ref.get();
  const existing = (snap.data() as Omit<Enrollment, "id"> | undefined) ?? null;
  const completed = new Set(existing?.completedLessonIds ?? []);
  completed.add(opts.lessonId);
  const completedIds = Array.from(completed);
  const progressPct = Math.min(100, Math.round((completedIds.length / total) * 100));
  const isComplete = progressPct >= 100;

  await ref.set(
    {
      memberId: opts.memberId,
      courseId: opts.courseId,
      status: isComplete ? "completed" : "enrolled",
      completedLessonIds: completedIds,
      progressPct,
      enrolledAt: existing?.enrolledAt ?? FieldValue.serverTimestamp(),
      completedAt: isComplete ? FieldValue.serverTimestamp() : null,
    },
    { merge: true },
  );

  return { progressPct, completed: isComplete };
}

/* ------------------------- Member catalog (cards) ---------------------- */

export interface AgencyCourseCardView extends CourseCardView {
  href: string | null;
}

/** Build the member-facing classroom catalog: published courses with the
 *  viewer's progress + lock state — mirrors tenant `listCoursesForMember`,
 *  folded together with the catalog card's `href` computation (tenant
 *  splits this across classroom-catalog-service.ts since it also unions
 *  linked Standalone Products; agency has no such second source yet, so
 *  one function covers it). */
export async function listAgencyCoursesForMember(opts: {
  linkBase: CommunityLinkBase;
  groupId: string;
  groupSlug: string;
  memberId: string;
  viewerLevel: number;
}): Promise<AgencyCourseCardView[]> {
  const snap = await coursesCol(opts.linkBase.agencyGroupId!, opts.groupId).where("published", "==", true).get();
  const courses = snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as Omit<Course, "id">) }))
    .sort((a, b) => a.order - b.order);

  return Promise.all(
    courses.map(async (course) => {
      const ref = courseDoc(opts.linkBase.agencyGroupId!, opts.groupId, course.id);
      const [lessonsSnap, enrollSnap] = await Promise.all([
        ref.collection("lessons").where("published", "==", true).get(),
        ref.collection("enrollments").doc(opts.memberId).get(),
      ]);
      const lessons = lessonsSnap.docs
        .map((d) => ({ id: d.id, order: (d.data().order as number) ?? 0 }))
        .sort((a, b) => a.order - b.order);
      const enroll = enrollSnap.data() as Enrollment | undefined;

      let locked: { reason: string; purchasable: boolean } | null = null;
      if (course.access === "level") {
        const need = course.requiredLevel ?? 2;
        if (opts.viewerLevel < need) {
          locked = { reason: `Unlocks at Level ${need}`, purchasable: false };
        }
      } else if (course.access === "purchase") {
        // No agency-level payment-collection mechanism exists yet (see this
        // file's module comment) — permanently locked with a price hint,
        // never a working buy flow.
        const price = course.priceCents != null ? ` — ${formatPrice(course.priceCents, course.currency)}` : "";
        locked = { reason: `Not yet available for purchase${price}`, purchasable: false };
      }

      const firstLessonId = lessons[0]?.id ?? null;
      return {
        id: course.id,
        title: course.title,
        description: course.description,
        thumbnailUrl: course.thumbnailUrl,
        lessonCount: lessons.length,
        progressPct: enroll?.progressPct ?? 0,
        locked,
        firstLessonId,
        href:
          locked || !firstLessonId
            ? null
            : communityLearningLessonHref(opts.linkBase, opts.groupSlug, course.id, firstLessonId),
      } satisfies AgencyCourseCardView;
    }),
  );
}

export type AgencyClassroomCourseSource = "native" | "standalone";
export interface AgencyClassroomCourseCard extends AgencyCourseCardView {
  source: AgencyClassroomCourseSource;
}

/**
 * Agency Community Classroom's combined catalog — native courses union
 * linked Agency Standalone Courses, mirroring tenant
 * classroom-catalog-service.ts's "one card shape, two sources" union. A
 * linked Standalone Course is never copied here — content, entitlement,
 * and progress all stay on the course itself; this only reads its
 * catalog-card summary. Unlike tenant (which embeds a linked Product's
 * lessons inside the Community route tree via a `/classroom/product/...`
 * bridge), a linked agency card's `href` goes straight to the course's
 * own site (`/course/agency/{courseId}` sales page, or its own classroom
 * home once enrolled) — that embedded-viewer bridge isn't ported for
 * agency this pass, a disclosed simplification, not a broken link.
 */
export async function listAgencyClassroomCatalogForMember(opts: {
  linkBase: CommunityLinkBase;
  groupId: string;
  groupSlug: string;
  personId: string;
  viewerLevel: number;
}): Promise<AgencyClassroomCourseCard[]> {
  const native = await listAgencyCoursesForMember({
    linkBase: opts.linkBase,
    groupId: opts.groupId,
    groupSlug: opts.groupSlug,
    memberId: opts.personId,
    viewerLevel: opts.viewerLevel,
  });
  const nativeCards: AgencyClassroomCourseCard[] = native.map((c) => ({ ...c, source: "native" }));

  const agencyId = opts.linkBase.agencyGroupId!;
  const [{ listAgencyStandaloneCoursesLinkedToGroup, getAgencyStandaloneEnrollment }, { hasPaidAgencyStandaloneCourse }] = await Promise.all([
    import("@/lib/server/agency-standalone-course-service"),
    import("@/lib/server/agency-standalone-course-purchase-service"),
  ]);
  const linked = await listAgencyStandaloneCoursesLinkedToGroup(agencyId, opts.groupId);
  const linkedCards: AgencyClassroomCourseCard[] = await Promise.all(
    linked.map(async (course) => {
      const enrolled = await getAgencyStandaloneEnrollment(agencyId, course.id, opts.personId);
      let locked: { reason: string; purchasable: boolean } | null = null;
      if (!enrolled && course.access === "purchase") {
        const paid = await hasPaidAgencyStandaloneCourse(agencyId, course.id, opts.personId);
        if (!paid) {
          const price = course.priceCents != null ? ` — ${formatPrice(course.priceCents, course.currency)}` : "";
          locked = { reason: `Buy${price}`, purchasable: true };
        }
      }
      const href = locked ? `/course/agency/${course.id}` : enrolled ? `/course/agency/${course.id}/classroom` : `/course/agency/${course.id}`;
      return {
        id: course.id,
        source: "standalone",
        title: course.title,
        description: "",
        thumbnailUrl: course.coverUrl,
        lessonCount: 0,
        progressPct: enrolled?.progressPct ?? 0,
        locked,
        firstLessonId: null,
        href,
      } satisfies AgencyClassroomCourseCard;
    }),
  );

  return [...nativeCards, ...linkedCards];
}
