import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { parseVideoUrl } from "@/lib/community/video-embed";
import { ensureUniqueSlug, isSlugAvailable, isValidSlugFormat } from "@/lib/slug";
import {
  DEFAULT_COURSE_THEME,
  DEFAULT_LESSON_THEME,
  normalizeCourseTheme,
  normalizeLessonTheme,
} from "@/types/course-theme";
import type { ResourceLink } from "@/types/community";
import type { ChartRuleCondition } from "@/lib/energetics/chart-rules";
import { evaluateChartRule } from "@/lib/energetics/chart-rules";
import { calculateHumanDesignProfile } from "@/lib/energetics/human-design";
import { calculateAstrologyChart, type AstrologyChart } from "@/lib/energetics/astrology";
import { geocodeBirthPlace } from "@/lib/energetics/geocode";
import {
  DEFAULT_STANDALONE_COURSE_ADVANCED,
  DEFAULT_STANDALONE_COURSE_INSTRUCTOR,
  DEFAULT_STANDALONE_COURSE_LEARNING_EXPERIENCE,
} from "@/types/standalone-courses";
import type {
  StandaloneCourse,
  StandaloneCourseAccess,
  StandaloneCourseAdvanced,
  StandaloneCourseBillingType,
  StandaloneCourseCurriculumSection,
  StandaloneCourseDifficulty,
  StandaloneCourseInstructor,
  StandaloneCourseLearningExperience,
  StandaloneCourseRecurringInterval,
  StandaloneCourseSection,
  StandaloneEnrollment,
  StandaloneLesson,
} from "@/types/standalone-courses";

/**
 * Agency Standalone Courses — the agency-scope sibling of
 * standalone-course-service.ts, rooted at `agencies/{agencyId}/
 * standaloneCourses` instead of `subAccounts/{saId}/standaloneCourses`.
 * Algorithms transfer verbatim (courses/sections/lessons/enrollments/
 * chart-gating are the same shape one level up); real differences:
 *  - No companion Course Offer auto-created on course creation — Course
 *    Offers is a distinct BUNDLING/cross-sell product layer, not required
 *    for a single course's own direct sale (the public sales page checks
 *    out straight against the course itself — see
 *    agency-standalone-course-purchase-service.ts). Not ported this pass;
 *    a real, disclosed gap, not silently merged into this file.
 *  - No CRM webhook/workflow emission (course.enrolled / lesson.completed /
 *    course.completed) — no agency workflow/automation system to emit to,
 *    same reasoning as every other agency-scope service in this codebase.
 *  - Notifications use `createNotification` directly with
 *    `subAccountId: null` and the resolved AGENCY brand name, instead of
 *    `notifyCourseAccessGranted`/`notifyCommunityAccessGranted` (which
 *    hardcode a `subAccounts/{saId}/...` read for the business name).
 */

function coursesCol(agencyId: string) {
  return getAdminDb().collection(`agencies/${agencyId}/standaloneCourses`);
}
function courseDoc(agencyId: string, courseId: string) {
  return coursesCol(agencyId).doc(courseId);
}

/* ------------------------------- Courses ------------------------------- */

export async function createAgencyStandaloneCourseServerSide(opts: {
  agencyId: string;
  title: string;
  aboutHtml?: string;
  coverUrl?: string | null;
  category?: string | null;
  access?: StandaloneCourseAccess;
  priceCents?: number | null;
  currency?: string | null;
  billingType?: StandaloneCourseBillingType;
  recurringInterval?: StandaloneCourseRecurringInterval | null;
  trialDays?: number | null;
  published?: boolean;
  showMemberCount?: boolean;
}): Promise<StandaloneCourse> {
  const access: StandaloneCourseAccess = opts.access ?? "open";
  const billingType: StandaloneCourseBillingType | null = access === "purchase" ? (opts.billingType ?? "oneTime") : null;
  const slug = await ensureUniqueSlug({
    db: getAdminDb(),
    collectionPath: `agencies/${opts.agencyId}/standaloneCourses`,
    base: opts.title,
  });
  const doc = {
    agencyId: opts.agencyId,
    title: opts.title.trim(),
    slug,
    aboutHtml: opts.aboutHtml?.trim() ?? "",
    coverUrl: opts.coverUrl ?? null,
    category: opts.category?.trim() || null,
    published: opts.published ?? false,
    access,
    priceCents: access === "purchase" ? (opts.priceCents ?? null) : null,
    currency: access === "purchase" ? (opts.currency ?? "USD") : null,
    billingType,
    recurringInterval: billingType === "recurring" ? (opts.recurringInterval ?? "month") : null,
    trialDays: billingType === "recurring" ? (opts.trialDays ?? null) : null,
    enrollmentCount: 0,
    showMemberCount: opts.showMemberCount ?? false,
    language: null as string | null,
    difficulty: null as StandaloneCourseDifficulty | null,
    topic: null as string | null,
    instructor: DEFAULT_STANDALONE_COURSE_INSTRUCTOR,
    logoUrl: null as string | null,
    faviconUrl: null as string | null,
    learningExperience: DEFAULT_STANDALONE_COURSE_LEARNING_EXPERIENCE,
    advanced: DEFAULT_STANDALONE_COURSE_ADVANCED,
    theme: DEFAULT_COURSE_THEME,
    lessonTheme: DEFAULT_LESSON_THEME,
    linkedCommunityGroupIds: [] as string[],
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };
  const ref = await coursesCol(opts.agencyId).add(doc);
  return { id: ref.id, ...doc } as unknown as StandaloneCourse;
}

export interface AgencyStandaloneCoursePatch {
  title?: string;
  slug?: string;
  aboutHtml?: string;
  coverUrl?: string | null;
  category?: string | null;
  published?: boolean;
  access?: StandaloneCourseAccess;
  priceCents?: number | null;
  currency?: string | null;
  billingType?: StandaloneCourseBillingType;
  recurringInterval?: StandaloneCourseRecurringInterval | null;
  trialDays?: number | null;
  showMemberCount?: boolean;
  language?: string | null;
  difficulty?: StandaloneCourseDifficulty | null;
  topic?: string | null;
  instructor?: Partial<StandaloneCourseInstructor>;
  logoUrl?: string | null;
  faviconUrl?: string | null;
  learningExperience?: Partial<StandaloneCourseLearningExperience>;
  advanced?: Partial<StandaloneCourseAdvanced>;
}

export async function updateAgencyStandaloneCourseServerSide(opts: {
  agencyId: string;
  courseId: string;
  patch: AgencyStandaloneCoursePatch;
}): Promise<void> {
  const updates: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
  const p = opts.patch;
  if (typeof p.title === "string") updates.title = p.title.trim();
  if (typeof p.slug === "string") {
    const slug = p.slug.trim().toLowerCase();
    if (!isValidSlugFormat(slug)) {
      throw new Error("Slug must be 1-48 lowercase letters, numbers, and hyphens, and can't start or end with a hyphen.");
    }
    const available = await isSlugAvailable({
      db: getAdminDb(),
      collectionPath: `agencies/${opts.agencyId}/standaloneCourses`,
      slug,
      excludeDocId: opts.courseId,
    });
    if (!available) throw new Error(`"${slug}" is already used by another course.`);
    updates.slug = slug;
  }
  if (typeof p.aboutHtml === "string") updates.aboutHtml = p.aboutHtml.trim();
  if (p.coverUrl !== undefined) updates.coverUrl = p.coverUrl;
  if (p.category !== undefined) updates.category = p.category?.trim() || null;
  if (typeof p.published === "boolean") updates.published = p.published;
  if (typeof p.showMemberCount === "boolean") updates.showMemberCount = p.showMemberCount;
  if (p.access) {
    updates.access = p.access;
    if (p.access === "purchase") {
      if (p.priceCents !== undefined) updates.priceCents = p.priceCents;
      updates.currency = p.currency ?? "USD";
      const billingType = p.billingType ?? "oneTime";
      updates.billingType = billingType;
      updates.recurringInterval = billingType === "recurring" ? (p.recurringInterval ?? "month") : null;
      updates.trialDays = billingType === "recurring" ? (p.trialDays ?? null) : null;
    } else {
      updates.priceCents = null;
      updates.currency = null;
      updates.billingType = null;
      updates.recurringInterval = null;
      updates.trialDays = null;
    }
  } else {
    if (p.priceCents !== undefined) updates.priceCents = p.priceCents;
    if (p.billingType !== undefined) {
      updates.billingType = p.billingType;
      updates.recurringInterval = p.billingType === "recurring" ? (p.recurringInterval ?? "month") : null;
      updates.trialDays = p.billingType === "recurring" ? (p.trialDays ?? null) : null;
    } else {
      if (p.recurringInterval !== undefined) updates.recurringInterval = p.recurringInterval;
      if (p.trialDays !== undefined) updates.trialDays = p.trialDays;
    }
  }
  if (p.language !== undefined) updates.language = p.language;
  if (p.difficulty !== undefined) updates.difficulty = p.difficulty;
  if (p.topic !== undefined) updates.topic = p.topic;
  if (p.logoUrl !== undefined) updates.logoUrl = p.logoUrl;
  if (p.faviconUrl !== undefined) updates.faviconUrl = p.faviconUrl;
  if (p.instructor) {
    for (const [key, value] of Object.entries(p.instructor)) updates[`instructor.${key}`] = value;
  }
  if (p.learningExperience) {
    for (const [key, value] of Object.entries(p.learningExperience)) updates[`learningExperience.${key}`] = value;
  }
  if (p.advanced) {
    for (const [key, value] of Object.entries(p.advanced)) updates[`advanced.${key}`] = value;
  }
  await courseDoc(opts.agencyId, opts.courseId).update(updates);
}

export async function deleteAgencyStandaloneCourseServerSide(opts: { agencyId: string; courseId: string }): Promise<void> {
  await getAdminDb().recursiveDelete(courseDoc(opts.agencyId, opts.courseId));
}

function withCourseDefaults(id: string, data: Omit<StandaloneCourse, "id">): StandaloneCourse {
  return {
    id,
    ...data,
    theme: normalizeCourseTheme(data.theme, DEFAULT_COURSE_THEME),
    lessonTheme: normalizeLessonTheme(data.lessonTheme, DEFAULT_LESSON_THEME),
    linkedCommunityGroupIds: data.linkedCommunityGroupIds ?? [],
    instructor: data.instructor ?? DEFAULT_STANDALONE_COURSE_INSTRUCTOR,
    learningExperience: data.learningExperience ?? DEFAULT_STANDALONE_COURSE_LEARNING_EXPERIENCE,
    advanced: data.advanced ?? DEFAULT_STANDALONE_COURSE_ADVANCED,
    language: data.language ?? null,
    difficulty: data.difficulty ?? null,
    topic: data.topic ?? null,
    logoUrl: data.logoUrl ?? null,
    faviconUrl: data.faviconUrl ?? null,
  };
}

export async function getAgencyStandaloneCourse(agencyId: string, courseId: string): Promise<StandaloneCourse | null> {
  const snap = await courseDoc(agencyId, courseId).get();
  if (!snap.exists) return null;
  return withCourseDefaults(snap.id, snap.data() as Omit<StandaloneCourse, "id">);
}

export async function getAgencyStandaloneCourseBySlug(agencyId: string, slug: string): Promise<StandaloneCourse | null> {
  const snap = await coursesCol(agencyId).where("slug", "==", slug).limit(1).get();
  if (snap.empty) return null;
  const course = withCourseDefaults(snap.docs[0].id, snap.docs[0].data() as Omit<StandaloneCourse, "id">);
  return course.published ? course : null;
}

export async function updateAgencyStandaloneCourseThemeServerSide(opts: {
  agencyId: string;
  courseId: string;
  theme: StandaloneCourse["theme"];
  lessonTheme?: StandaloneCourse["lessonTheme"];
}): Promise<void> {
  await courseDoc(opts.agencyId, opts.courseId).update({
    theme: opts.theme,
    ...(opts.lessonTheme ? { lessonTheme: opts.lessonTheme } : {}),
    updatedAt: FieldValue.serverTimestamp(),
  });
}

export async function listAgencyStandaloneCourses(agencyId: string): Promise<StandaloneCourse[]> {
  const snap = await coursesCol(agencyId).orderBy("createdAt", "desc").get();
  return snap.docs.map((d) => withCourseDefaults(d.id, d.data() as Omit<StandaloneCourse, "id">));
}

/* ------------------------- Community Classroom linking ------------------ */

export async function listAgencyStandaloneCoursesLinkedToGroup(
  agencyId: string,
  groupId: string,
): Promise<StandaloneCourse[]> {
  const snap = await coursesCol(agencyId)
    .where("linkedCommunityGroupIds", "array-contains", groupId)
    .where("published", "==", true)
    .get();
  return snap.docs.map((d) => withCourseDefaults(d.id, d.data() as Omit<StandaloneCourse, "id">));
}

export async function linkAgencyCommunityGroupServerSide(opts: {
  agencyId: string;
  courseId: string;
  groupId: string;
}): Promise<void> {
  await courseDoc(opts.agencyId, opts.courseId).update({
    linkedCommunityGroupIds: FieldValue.arrayUnion(opts.groupId),
    updatedAt: FieldValue.serverTimestamp(),
  });
}

export async function unlinkAgencyCommunityGroupServerSide(opts: {
  agencyId: string;
  courseId: string;
  groupId: string;
}): Promise<void> {
  await courseDoc(opts.agencyId, opts.courseId).update({
    linkedCommunityGroupIds: FieldValue.arrayRemove(opts.groupId),
    updatedAt: FieldValue.serverTimestamp(),
  });
}

/** Grant active membership in every Agency Community Group linked to this
 *  course — mirrors tenant `grantLinkedCommunityGroupsServerSide`, writing
 *  onto the agency roster doc shape instead of a separate memberships
 *  collection (see community-agency-service.ts's AgencyGroupMemberRoster).
 *  `personId` is the buyer's global Person id — the roster doc IS the
 *  membership (no separate join needed), matching every other agency
 *  Community grant path in this codebase. */
export async function grantLinkedAgencyCommunityGroupsServerSide(opts: {
  agencyId: string;
  courseId: string;
  personId: string;
  email: string;
  displayName: string | null;
}): Promise<void> {
  const course = await getAgencyStandaloneCourse(opts.agencyId, opts.courseId);
  if (!course || course.linkedCommunityGroupIds.length === 0) return;

  const db = getAdminDb();
  for (const groupId of course.linkedCommunityGroupIds) {
    const groupRef = db.doc(`agencies/${opts.agencyId}/communityGroups/${groupId}`);
    const membersCol = groupRef.collection("members");
    const existingSnap = await membersCol.where("personId", "==", opts.personId).limit(1).get();
    const existing = existingSnap.docs[0] ?? null;
    const wasActive = existing?.exists && existing.data().status === "active";
    const memberRef = existing ? existing.ref : membersCol.doc();
    await memberRef.set(
      {
        agencyId: opts.agencyId,
        groupId,
        email: opts.email,
        displayName: existing?.data()?.displayName ?? opts.displayName,
        personId: opts.personId,
        source: "customer" as const,
        status: "active" as const,
        invitedByUid: existing?.data()?.invitedByUid ?? "system",
        createdAt: existing?.data()?.createdAt ?? FieldValue.serverTimestamp(),
        activatedAt: existing?.data()?.activatedAt ?? FieldValue.serverTimestamp(),
        ...(existing?.data()?.points !== undefined ? { points: existing.data()!.points } : {}),
        ...(existing?.data()?.level !== undefined ? { level: existing.data()!.level } : {}),
      },
      { merge: true },
    );
    // Note: tenant records this grant in community-access-source-service.ts
    // (subAccounts/{saId}/...) so a later canceled subscription can
    // precisely revoke a Product-derived membership. That service is
    // tenant-path-shaped and not reusable here; not ported this pass — a
    // real, disclosed gap. The grant itself (below) is unaffected; only
    // "auto-revoke this specific group access if this course's paid
    // access is later canceled" doesn't happen yet for agency.
    if (!wasActive) {
      await groupRef.update({ memberCount: FieldValue.increment(1) });
    }
  }
}

/* ------------------------------ Sections ------------------------------- */

export async function createAgencyStandaloneSectionServerSide(opts: {
  agencyId: string;
  courseId: string;
  title: string;
}): Promise<StandaloneCourseSection> {
  const col = courseDoc(opts.agencyId, opts.courseId).collection("sections");
  const count = (await col.count().get()).data().count;
  const doc = { title: opts.title.trim() || "Untitled section", order: count };
  const ref = await col.add(doc);
  return { id: ref.id, ...doc };
}

export async function updateAgencyStandaloneSectionServerSide(opts: {
  agencyId: string;
  courseId: string;
  sectionId: string;
  patch: { title?: string; order?: number };
}): Promise<void> {
  const updates: Record<string, unknown> = {};
  if (typeof opts.patch.title === "string") updates.title = opts.patch.title.trim();
  if (typeof opts.patch.order === "number") updates.order = opts.patch.order;
  await courseDoc(opts.agencyId, opts.courseId).collection("sections").doc(opts.sectionId).update(updates);
}

export async function deleteAgencyStandaloneSectionServerSide(opts: {
  agencyId: string;
  courseId: string;
  sectionId: string;
}): Promise<void> {
  await courseDoc(opts.agencyId, opts.courseId).collection("sections").doc(opts.sectionId).delete();
}

/* ------------------------------- Lessons ------------------------------- */

function lessonsCol(agencyId: string, courseId: string) {
  return courseDoc(agencyId, courseId).collection("lessons");
}

export async function createAgencyStandaloneLessonServerSide(opts: {
  agencyId: string;
  courseId: string;
  sectionId: string | null;
  title: string;
}): Promise<StandaloneLesson> {
  const col = lessonsCol(opts.agencyId, opts.courseId);
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
    chartUnlockCondition: null,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };
  const ref = await col.add(doc);
  return { id: ref.id, ...doc } as unknown as StandaloneLesson;
}

export interface AgencyStandaloneLessonPatch {
  title?: string;
  sectionId?: string | null;
  order?: number;
  published?: boolean;
  videoUrl?: string | null;
  bodyHtml?: string;
  resourceLinks?: ResourceLink[];
  chartUnlockCondition?: ChartRuleCondition | null;
}

export async function updateAgencyStandaloneLessonServerSide(opts: {
  agencyId: string;
  courseId: string;
  lessonId: string;
  patch: AgencyStandaloneLessonPatch;
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
  if (p.chartUnlockCondition !== undefined) updates.chartUnlockCondition = p.chartUnlockCondition;
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
  await lessonsCol(opts.agencyId, opts.courseId).doc(opts.lessonId).update(updates);
  return { videoError };
}

export async function deleteAgencyStandaloneLessonServerSide(opts: {
  agencyId: string;
  courseId: string;
  lessonId: string;
}): Promise<void> {
  await getAdminDb().recursiveDelete(lessonsCol(opts.agencyId, opts.courseId).doc(opts.lessonId));
}

export function filterAgencyLessonsForEnrollment(
  lessons: StandaloneLesson[],
  enrollment: StandaloneEnrollment | null,
): StandaloneLesson[] {
  return lessons.filter((l) => {
    if (!l.chartUnlockCondition) return true;
    if (!enrollment?.birthChart) return false;
    return evaluateChartRule(l.chartUnlockCondition, {
      humanDesign: enrollment.birthChart.humanDesign,
      astrology: enrollment.birthChart.astrology,
    });
  });
}

/* --------------------------- Read: full tree --------------------------- */

export interface AgencyStandaloneCourseTree {
  course: StandaloneCourse;
  sections: StandaloneCourseSection[];
  lessons: StandaloneLesson[];
}

export async function getAgencyStandaloneCourseTree(opts: {
  agencyId: string;
  courseId: string;
  includeUnpublished: boolean;
}): Promise<AgencyStandaloneCourseTree | null> {
  const course = await getAgencyStandaloneCourse(opts.agencyId, opts.courseId);
  if (!course) return null;
  const ref = courseDoc(opts.agencyId, opts.courseId);
  const [sectionsSnap, lessonsSnap] = await Promise.all([
    ref.collection("sections").orderBy("order", "asc").get(),
    ref.collection("lessons").orderBy("order", "asc").get(),
  ]);
  const sections = sectionsSnap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<StandaloneCourseSection, "id">) }));
  let lessons = lessonsSnap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<StandaloneLesson, "id">) }));
  if (!opts.includeUnpublished) lessons = lessons.filter((l) => l.published);
  return { course, sections, lessons };
}

export async function getAgencyCurriculumOutline(
  agencyId: string,
  courseId: string,
): Promise<StandaloneCourseCurriculumSection[]> {
  const ref = courseDoc(agencyId, courseId);
  const [sectionsSnap, lessonsSnap] = await Promise.all([
    ref.collection("sections").orderBy("order", "asc").get(),
    ref.collection("lessons").where("published", "==", true).get(),
  ]);
  const counts = new Map<string | null, number>();
  for (const d of lessonsSnap.docs) {
    const sectionId = (d.data().sectionId as string | null) ?? null;
    counts.set(sectionId, (counts.get(sectionId) ?? 0) + 1);
  }
  return sectionsSnap.docs.map((d) => ({
    id: d.id,
    title: d.data().title as string,
    order: (d.data().order as number) ?? 0,
    lessonCount: counts.get(d.id) ?? 0,
  }));
}

/* ------------------------- Enrollment / progress ----------------------- */

function enrollmentDoc(agencyId: string, courseId: string, personId: string) {
  return courseDoc(agencyId, courseId).collection("enrollments").doc(personId);
}

export async function getAgencyStandaloneEnrollment(
  agencyId: string,
  courseId: string,
  personId: string,
): Promise<StandaloneEnrollment | null> {
  const snap = await enrollmentDoc(agencyId, courseId, personId).get();
  if (!snap.exists) return null;
  return { id: snap.id, ...(snap.data() as Omit<StandaloneEnrollment, "id">) };
}

export interface AgencyEnrollBirthDetails {
  name: string;
  birthDate: string;
  birthTime: string;
  birthPlace: string;
  lat?: number;
  lng?: number;
  timeZone?: string;
}

export async function agencyCourseHasChartGatedLessons(agencyId: string, courseId: string): Promise<boolean> {
  const snap = await lessonsCol(agencyId, courseId).where("published", "==", true).get();
  return snap.docs.some((d) => !!d.data().chartUnlockCondition);
}

async function computeBirthChart(details: AgencyEnrollBirthDetails): Promise<NonNullable<StandaloneEnrollment["birthChart"]>> {
  const place =
    typeof details.lat === "number" && typeof details.lng === "number" && details.timeZone
      ? { lat: details.lat, lng: details.lng, timeZone: details.timeZone }
      : await geocodeBirthPlace(details.birthPlace);

  const timeZone = place?.timeZone ?? "UTC";
  const humanDesign = calculateHumanDesignProfile({ date: details.birthDate, time: details.birthTime, timeZone });

  let astrology: AstrologyChart | null = null;
  if (place) {
    try {
      astrology = calculateAstrologyChart({ date: details.birthDate, time: details.birthTime, timeZone, lat: place.lat, lng: place.lng });
    } catch {
      // Astrology is a bonus on top of Human Design here — see tenant's identical comment.
    }
  }

  return { name: details.name, birthDate: details.birthDate, birthTime: details.birthTime, birthPlace: details.birthPlace, humanDesign, astrology };
}

/** Idempotently enroll a Person in a free ("open") course. `personId` (not
 *  a Member id) is the enrollment key throughout this file — the global
 *  MyMagnetix identity, per the explicit "no fake tenant Members" agency
 *  instruction. */
export async function enrollInAgencyStandaloneCourseServerSide(opts: {
  agencyId: string;
  courseId: string;
  personId: string;
  email: string;
  displayName: string | null;
  birthDetails?: AgencyEnrollBirthDetails;
}): Promise<void> {
  const ref = enrollmentDoc(opts.agencyId, opts.courseId, opts.personId);
  const snap = await ref.get();
  if (!snap.exists) {
    const birthChart = opts.birthDetails ? await computeBirthChart(opts.birthDetails) : null;
    await ref.set({
      memberId: opts.personId,
      courseId: opts.courseId,
      status: "enrolled",
      completedLessonIds: [],
      progressPct: 0,
      enrolledAt: FieldValue.serverTimestamp(),
      completedAt: null,
      birthChart,
    });
    await courseDoc(opts.agencyId, opts.courseId).update({ enrollmentCount: FieldValue.increment(1) });
    await notifyAgencyCourseAccessGranted({ agencyId: opts.agencyId, courseId: opts.courseId, personId: opts.personId }).catch((err) =>
      console.error("[enrollInAgencyStandaloneCourseServerSide] notification failed", err),
    );
  }
  await grantLinkedAgencyCommunityGroupsServerSide({
    agencyId: opts.agencyId,
    courseId: opts.courseId,
    personId: opts.personId,
    email: opts.email,
    displayName: opts.displayName,
  });
}

export async function markAgencyStandaloneLessonCompleteServerSide(opts: {
  agencyId: string;
  courseId: string;
  personId: string;
  lessonId: string;
}): Promise<{ progressPct: number; completed: boolean }> {
  const ref = enrollmentDoc(opts.agencyId, opts.courseId, opts.personId);
  const publishedSnap = await lessonsCol(opts.agencyId, opts.courseId).where("published", "==", true).get();
  const total = publishedSnap.size || 1;

  const snap = await ref.get();
  const existing = (snap.data() as Omit<StandaloneEnrollment, "id"> | undefined) ?? null;
  const completed = new Set(existing?.completedLessonIds ?? []);
  completed.add(opts.lessonId);
  const completedIds = Array.from(completed);
  const progressPct = Math.min(100, Math.round((completedIds.length / total) * 100));
  const isComplete = progressPct >= 100;

  await ref.set(
    {
      memberId: opts.personId,
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

/* -------------------------------- Notify -------------------------------- */

async function notifyAgencyCourseAccessGranted(opts: { agencyId: string; courseId: string; personId: string }): Promise<void> {
  const [{ createNotification }, { resolveBrandName }] = await Promise.all([
    import("@/lib/server/notification-service"),
    import("@/lib/landing/resolve-brand"),
  ]);
  const [courseSnap, businessName] = await Promise.all([courseDoc(opts.agencyId, opts.courseId).get(), resolveBrandName()]);
  const courseName = (courseSnap.data()?.title as string) || "a course";
  await createNotification({
    personId: opts.personId,
    subAccountId: null,
    eventType: "course.access.granted",
    objectType: "course",
    objectId: opts.courseId,
    sourceObjectId: opts.courseId,
    title: `You now have access to ${courseName}`,
    destination: `/course/agency/${opts.courseId}/classroom`,
    meta: { courseName, businessName },
  });
}
