import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { emitWebhookEvent } from "@/lib/api/webhooks/dispatch";
import { parseVideoUrl } from "@/lib/community/video-embed";
import { createCourseOfferServerSide } from "@/lib/server/course-offer-service";
import {
  DEFAULT_COURSE_THEME,
  DEFAULT_LESSON_THEME,
  normalizeCourseTheme,
  normalizeLessonTheme,
} from "@/types/course-theme";
import type { OfferType } from "@/types/course-offers";
import type { ResourceLink } from "@/types/community";
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
 * Server-side Standalone Course service (Admin SDK). Forked from
 * `community-classroom-service.ts` — same section/lesson/progress shape and
 * behavior, minus everything that depended on a community group: no `groupId`
 * threading, no `access: "level"` (no group/membership concept exists here).
 * Staff mutate via /api/sub-accounts/[id]/standalone-courses/*; buyers read
 * the server-rendered sales page + player and mark lessons complete.
 */

function coursesCol(saId: string) {
  return getAdminDb().collection(`subAccounts/${saId}/standaloneCourses`);
}
function courseDoc(saId: string, courseId: string) {
  return coursesCol(saId).doc(courseId);
}

/* ------------------------------- Courses ------------------------------- */

export async function createStandaloneCourseServerSide(opts: {
  subAccountId: string;
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
  const billingType: StandaloneCourseBillingType | null =
    access === "purchase" ? (opts.billingType ?? "oneTime") : null;
  const doc = {
    subAccountId: opts.subAccountId,
    agencyId: opts.agencyId,
    title: opts.title.trim(),
    aboutHtml: opts.aboutHtml?.trim() ?? "",
    coverUrl: opts.coverUrl ?? null,
    category: opts.category?.trim() || null,
    published: opts.published ?? false,
    access,
    priceCents: access === "purchase" ? (opts.priceCents ?? null) : null,
    currency: access === "purchase" ? (opts.currency ?? "USD") : null,
    billingType,
    recurringInterval:
      billingType === "recurring" ? (opts.recurringInterval ?? "month") : null,
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
  const ref = await coursesCol(opts.subAccountId).add(doc);
  const course = { id: ref.id, ...doc } as StandaloneCourse;

  // Auto-create a companion draft Offer mirroring whatever pricing was set
  // in the course wizard's Pricing step — an Offer can't exist before its
  // course does, so course creation is the trigger. One-time copy, not an
  // ongoing sync: editing the course's price afterward doesn't touch this
  // offer, same as applying a Theme Template copies rather than references.
  const offerType: OfferType =
    access === "open" ? "free" : billingType === "recurring" ? "recurring" : "oneTime";
  await createCourseOfferServerSide({
    subAccountId: opts.subAccountId,
    agencyId: opts.agencyId,
    title: course.title,
    courseIds: [course.id],
    type: offerType,
    priceCents: course.priceCents,
    currency: course.currency,
    recurringInterval: course.recurringInterval,
    trialDays: course.trialDays,
  });

  return course;
}

export interface StandaloneCoursePatch {
  title?: string;
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

export async function updateStandaloneCourseServerSide(opts: {
  subAccountId: string;
  courseId: string;
  patch: StandaloneCoursePatch;
}): Promise<void> {
  const updates: Record<string, unknown> = {
    updatedAt: FieldValue.serverTimestamp(),
  };
  const p = opts.patch;
  if (typeof p.title === "string") updates.title = p.title.trim();
  if (typeof p.aboutHtml === "string") updates.aboutHtml = p.aboutHtml.trim();
  if (p.coverUrl !== undefined) updates.coverUrl = p.coverUrl;
  if (p.category !== undefined) updates.category = p.category?.trim() || null;
  if (typeof p.published === "boolean") updates.published = p.published;
  if (typeof p.showMemberCount === "boolean") {
    updates.showMemberCount = p.showMemberCount;
  }
  if (p.access) {
    updates.access = p.access;
    if (p.access === "purchase") {
      if (p.priceCents !== undefined) updates.priceCents = p.priceCents;
      updates.currency = p.currency ?? "USD";
      const billingType = p.billingType ?? "oneTime";
      updates.billingType = billingType;
      updates.recurringInterval =
        billingType === "recurring" ? (p.recurringInterval ?? "month") : null;
      updates.trialDays =
        billingType === "recurring" ? (p.trialDays ?? null) : null;
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
      updates.recurringInterval =
        p.billingType === "recurring" ? (p.recurringInterval ?? "month") : null;
      updates.trialDays =
        p.billingType === "recurring" ? (p.trialDays ?? null) : null;
    } else {
      if (p.recurringInterval !== undefined) {
        updates.recurringInterval = p.recurringInterval;
      }
      if (p.trialDays !== undefined) updates.trialDays = p.trialDays;
    }
  }
  if (p.language !== undefined) updates.language = p.language;
  if (p.difficulty !== undefined) updates.difficulty = p.difficulty;
  if (p.topic !== undefined) updates.topic = p.topic;
  if (p.logoUrl !== undefined) updates.logoUrl = p.logoUrl;
  if (p.faviconUrl !== undefined) updates.faviconUrl = p.faviconUrl;
  if (p.instructor) {
    for (const [key, value] of Object.entries(p.instructor)) {
      updates[`instructor.${key}`] = value;
    }
  }
  if (p.learningExperience) {
    for (const [key, value] of Object.entries(p.learningExperience)) {
      updates[`learningExperience.${key}`] = value;
    }
  }
  if (p.advanced) {
    for (const [key, value] of Object.entries(p.advanced)) {
      updates[`advanced.${key}`] = value;
    }
  }
  await courseDoc(opts.subAccountId, opts.courseId).update(updates);
}

/** Apply the current learning-experience toggles to every course in the
 *  sub-account — the Settings tab's "Apply to all courses" button. */
export async function applyLearningExperienceToAllCoursesServerSide(opts: {
  subAccountId: string;
  learningExperience: StandaloneCourseLearningExperience;
}): Promise<void> {
  const snap = await coursesCol(opts.subAccountId).get();
  await Promise.all(
    snap.docs.map((d) =>
      d.ref.update({
        learningExperience: opts.learningExperience,
        updatedAt: FieldValue.serverTimestamp(),
      }),
    ),
  );
}

export async function deleteStandaloneCourseServerSide(opts: {
  subAccountId: string;
  courseId: string;
}): Promise<void> {
  await getAdminDb().recursiveDelete(
    courseDoc(opts.subAccountId, opts.courseId),
  );
}

/** Courses created before theming/community-linking/Settings shipped have no
 *  such fields — every read falls back to sensible defaults. */
function withCourseDefaults(
  id: string,
  data: Omit<StandaloneCourse, "id">,
): StandaloneCourse {
  return {
    id,
    ...data,
    theme: normalizeCourseTheme(data.theme, DEFAULT_COURSE_THEME),
    lessonTheme: normalizeLessonTheme(data.lessonTheme, DEFAULT_LESSON_THEME),
    linkedCommunityGroupIds: data.linkedCommunityGroupIds ?? [],
    instructor: data.instructor ?? DEFAULT_STANDALONE_COURSE_INSTRUCTOR,
    learningExperience:
      data.learningExperience ?? DEFAULT_STANDALONE_COURSE_LEARNING_EXPERIENCE,
    advanced: data.advanced ?? DEFAULT_STANDALONE_COURSE_ADVANCED,
    language: data.language ?? null,
    difficulty: data.difficulty ?? null,
    topic: data.topic ?? null,
    logoUrl: data.logoUrl ?? null,
    faviconUrl: data.faviconUrl ?? null,
  };
}

export async function getStandaloneCourse(
  saId: string,
  courseId: string,
): Promise<StandaloneCourse | null> {
  const snap = await courseDoc(saId, courseId).get();
  if (!snap.exists) return null;
  return withCourseDefaults(
    snap.id,
    snap.data() as Omit<StandaloneCourse, "id">,
  );
}

/** Full-object replace of a course's theme (staff-only, via the theme editor). */
export async function updateStandaloneCourseThemeServerSide(opts: {
  subAccountId: string;
  courseId: string;
  theme: StandaloneCourse["theme"];
  lessonTheme?: StandaloneCourse["lessonTheme"];
}): Promise<void> {
  await courseDoc(opts.subAccountId, opts.courseId).update({
    theme: opts.theme,
    ...(opts.lessonTheme ? { lessonTheme: opts.lessonTheme } : {}),
    updatedAt: FieldValue.serverTimestamp(),
  });
}

export async function listStandaloneCourses(
  saId: string,
): Promise<StandaloneCourse[]> {
  const snap = await coursesCol(saId).orderBy("createdAt", "desc").get();
  return snap.docs.map((d) =>
    withCourseDefaults(d.id, d.data() as Omit<StandaloneCourse, "id">),
  );
}

/**
 * Link/unlink a Community Group to a Standalone Course — connects a course
 * built "outside" a community to one or more groups "inside" Community.
 * Anyone who enrolls in the course is auto-granted membership in every
 * linked group (see `grantLinkedCommunityGroupsServerSide`).
 */
export async function linkCommunityGroupServerSide(opts: {
  subAccountId: string;
  courseId: string;
  groupId: string;
}): Promise<void> {
  await courseDoc(opts.subAccountId, opts.courseId).update({
    linkedCommunityGroupIds: FieldValue.arrayUnion(opts.groupId),
    updatedAt: FieldValue.serverTimestamp(),
  });
}

export async function unlinkCommunityGroupServerSide(opts: {
  subAccountId: string;
  courseId: string;
  groupId: string;
}): Promise<void> {
  await courseDoc(opts.subAccountId, opts.courseId).update({
    linkedCommunityGroupIds: FieldValue.arrayRemove(opts.groupId),
    updatedAt: FieldValue.serverTimestamp(),
  });
}

/**
 * Grant active membership in every Community Group linked to this course —
 * called once a member enrolls (free or paid), from both
 * `enrollInStandaloneCourseServerSide` and
 * `markStandaloneCoursePurchasePaidServerSide`. Mirrors the inline
 * membership-write in `community-purchase-service.ts`'s
 * `markPurchasePaidServerSide` (`scope === "group"` branch) rather than
 * calling `joinGroupServerSide` — the member already paid for/enrolled in
 * the course, so group access is granted directly, bypassing that group's
 * own paid/approval join policy.
 */
export async function grantLinkedCommunityGroupsServerSide(opts: {
  subAccountId: string;
  agencyId: string;
  courseId: string;
  memberId: string;
}): Promise<void> {
  const course = await getStandaloneCourse(opts.subAccountId, opts.courseId);
  if (!course || course.linkedCommunityGroupIds.length === 0) return;

  const db = getAdminDb();
  for (const groupId of course.linkedCommunityGroupIds) {
    const groupRef = db.doc(
      `subAccounts/${opts.subAccountId}/communityGroups/${groupId}`,
    );
    const memRef = groupRef.collection("memberships").doc(opts.memberId);
    const existing = await memRef.get();
    const wasActive = existing.exists && existing.data()!.status === "active";
    await memRef.set(
      {
        subAccountId: opts.subAccountId,
        agencyId: opts.agencyId,
        groupId,
        memberId: opts.memberId,
        role: "member",
        status: "active",
        points: existing.data()?.points ?? 0,
        level: existing.data()?.level ?? 1,
        joinedAt: existing.data()?.joinedAt ?? FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    if (!wasActive) {
      await groupRef.update({ memberCount: FieldValue.increment(1) });
      void emitWebhookEvent({
        subAccountId: opts.subAccountId,
        agencyId: opts.agencyId,
        mode: "live",
        type: "community.member.joined",
        payload: {
          groupId,
          memberId: opts.memberId,
          via: "standalone-course-link",
          courseId: opts.courseId,
        },
      });
    }
  }
}

/* ------------------------------ Sections ------------------------------- */

export async function createStandaloneSectionServerSide(opts: {
  subAccountId: string;
  courseId: string;
  title: string;
}): Promise<StandaloneCourseSection> {
  const col = courseDoc(opts.subAccountId, opts.courseId).collection(
    "sections",
  );
  const count = (await col.count().get()).data().count;
  const doc = { title: opts.title.trim() || "Untitled section", order: count };
  const ref = await col.add(doc);
  return { id: ref.id, ...doc };
}

export async function updateStandaloneSectionServerSide(opts: {
  subAccountId: string;
  courseId: string;
  sectionId: string;
  patch: { title?: string; order?: number };
}): Promise<void> {
  const updates: Record<string, unknown> = {};
  if (typeof opts.patch.title === "string")
    updates.title = opts.patch.title.trim();
  if (typeof opts.patch.order === "number") updates.order = opts.patch.order;
  await courseDoc(opts.subAccountId, opts.courseId)
    .collection("sections")
    .doc(opts.sectionId)
    .update(updates);
}

export async function deleteStandaloneSectionServerSide(opts: {
  subAccountId: string;
  courseId: string;
  sectionId: string;
}): Promise<void> {
  await courseDoc(opts.subAccountId, opts.courseId)
    .collection("sections")
    .doc(opts.sectionId)
    .delete();
  // Lessons keep their now-dangling sectionId and render as "Other".
}

/* ------------------------------- Lessons ------------------------------- */

function lessonsCol(saId: string, courseId: string) {
  return courseDoc(saId, courseId).collection("lessons");
}

export async function createStandaloneLessonServerSide(opts: {
  subAccountId: string;
  courseId: string;
  sectionId: string | null;
  title: string;
}): Promise<StandaloneLesson> {
  const col = lessonsCol(opts.subAccountId, opts.courseId);
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
  return { id: ref.id, ...doc } as StandaloneLesson;
}

export interface StandaloneLessonPatch {
  title?: string;
  sectionId?: string | null;
  order?: number;
  published?: boolean;
  videoUrl?: string | null;
  bodyHtml?: string;
  resourceLinks?: ResourceLink[];
}

export async function updateStandaloneLessonServerSide(opts: {
  subAccountId: string;
  courseId: string;
  lessonId: string;
  patch: StandaloneLessonPatch;
}): Promise<{ videoError?: boolean }> {
  const updates: Record<string, unknown> = {
    updatedAt: FieldValue.serverTimestamp(),
  };
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
        videoError = true; // Leave the existing video untouched.
      }
    }
  }
  await lessonsCol(opts.subAccountId, opts.courseId)
    .doc(opts.lessonId)
    .update(updates);
  return { videoError };
}

export async function deleteStandaloneLessonServerSide(opts: {
  subAccountId: string;
  courseId: string;
  lessonId: string;
}): Promise<void> {
  await getAdminDb().recursiveDelete(
    lessonsCol(opts.subAccountId, opts.courseId).doc(opts.lessonId),
  );
}

/* --------------------------- Read: full tree --------------------------- */

export interface StandaloneCourseTree {
  course: StandaloneCourse;
  sections: StandaloneCourseSection[];
  lessons: StandaloneLesson[];
}

export async function getStandaloneCourseTree(opts: {
  subAccountId: string;
  courseId: string;
  includeUnpublished: boolean;
}): Promise<StandaloneCourseTree | null> {
  const course = await getStandaloneCourse(opts.subAccountId, opts.courseId);
  if (!course) return null;
  const ref = courseDoc(opts.subAccountId, opts.courseId);
  const [sectionsSnap, lessonsSnap] = await Promise.all([
    ref.collection("sections").orderBy("order", "asc").get(),
    ref.collection("lessons").orderBy("order", "asc").get(),
  ]);
  const sections = sectionsSnap.docs.map(
    (d) => ({ id: d.id, ...(d.data() as Omit<StandaloneCourseSection, "id">) }),
  );
  let lessons = lessonsSnap.docs.map(
    (d) => ({ id: d.id, ...(d.data() as Omit<StandaloneLesson, "id">) }),
  );
  if (!opts.includeUnpublished) lessons = lessons.filter((l) => l.published);
  return { course, sections, lessons };
}

/**
 * Summary-only curriculum outline for the public sales page — section names
 * + published-lesson counts, no individual lesson titles/links (matches the
 * GoKollab reference: collapsible sections, no pre-purchase lesson list).
 */
export async function getCurriculumOutline(
  saId: string,
  courseId: string,
): Promise<StandaloneCourseCurriculumSection[]> {
  const ref = courseDoc(saId, courseId);
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

function enrollmentDoc(saId: string, courseId: string, memberId: string) {
  return courseDoc(saId, courseId).collection("enrollments").doc(memberId);
}

export async function getStandaloneEnrollment(
  saId: string,
  courseId: string,
  memberId: string,
): Promise<StandaloneEnrollment | null> {
  const snap = await enrollmentDoc(saId, courseId, memberId).get();
  if (!snap.exists) return null;
  return { id: snap.id, ...(snap.data() as Omit<StandaloneEnrollment, "id">) };
}

/**
 * Idempotently enroll a member in a free ("open") course + bump the
 * denormalized enrollment count once. No-ops if already enrolled.
 */
export async function enrollInStandaloneCourseServerSide(opts: {
  subAccountId: string;
  agencyId: string;
  courseId: string;
  memberId: string;
}): Promise<void> {
  const ref = enrollmentDoc(opts.subAccountId, opts.courseId, opts.memberId);
  const snap = await ref.get();
  if (!snap.exists) {
    await ref.set({
      memberId: opts.memberId,
      courseId: opts.courseId,
      status: "enrolled",
      completedLessonIds: [],
      progressPct: 0,
      enrolledAt: FieldValue.serverTimestamp(),
      completedAt: null,
    });
    await courseDoc(opts.subAccountId, opts.courseId).update({
      enrollmentCount: FieldValue.increment(1),
    });
    void emitWebhookEvent({
      subAccountId: opts.subAccountId,
      agencyId: opts.agencyId,
      mode: "live",
      type: "course.enrolled",
      payload: { courseId: opts.courseId, memberId: opts.memberId },
    });
  }
  // Runs even on a repeat call — idempotent, and covers a group being
  // linked to the course after this member had already enrolled.
  await grantLinkedCommunityGroupsServerSide({
    subAccountId: opts.subAccountId,
    agencyId: opts.agencyId,
    courseId: opts.courseId,
    memberId: opts.memberId,
  });
}

/** Idempotently mark a lesson complete + recompute the course progress. */
export async function markStandaloneLessonCompleteServerSide(opts: {
  subAccountId: string;
  agencyId: string;
  courseId: string;
  memberId: string;
  lessonId: string;
}): Promise<{ progressPct: number; completed: boolean }> {
  const ref = enrollmentDoc(opts.subAccountId, opts.courseId, opts.memberId);
  const publishedSnap = await lessonsCol(opts.subAccountId, opts.courseId)
    .where("published", "==", true)
    .get();
  const total = publishedSnap.size || 1;

  const snap = await ref.get();
  const existing =
    (snap.data() as Omit<StandaloneEnrollment, "id"> | undefined) ?? null;
  const completed = new Set(existing?.completedLessonIds ?? []);
  completed.add(opts.lessonId);
  const completedIds = Array.from(completed);
  const progressPct = Math.min(
    100,
    Math.round((completedIds.length / total) * 100),
  );
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

  const wasAlreadyComplete = existing?.status === "completed";
  void emitWebhookEvent({
    subAccountId: opts.subAccountId,
    agencyId: opts.agencyId,
    mode: "live",
    type: "course.lesson.completed",
    payload: {
      courseId: opts.courseId,
      lessonId: opts.lessonId,
      memberId: opts.memberId,
      progressPct,
    },
  });
  if (isComplete && !wasAlreadyComplete) {
    void emitWebhookEvent({
      subAccountId: opts.subAccountId,
      agencyId: opts.agencyId,
      mode: "live",
      type: "course.completed",
      payload: { courseId: opts.courseId, memberId: opts.memberId },
    });
  }

  return { progressPct, completed: isComplete };
}
