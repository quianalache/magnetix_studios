import "server-only";

import { randomUUID } from "crypto";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { updateAgencyStandaloneCourseThemeServerSide } from "@/lib/server/agency-standalone-course-service";
import { isCoreSidebarBlock } from "@/types/course-theme";
import type { CourseTheme, CourseThemeTemplate, LessonTheme } from "@/types/course-theme";

/**
 * Reusable course-theme templates for Agency Standalone Courses/Offers —
 * the agency-scope sibling of course-theme-template-service.ts, stored at
 * `agencies/{agencyId}/courseThemeTemplates/{templateId}`. Applying a
 * template is a deep COPY (fresh block ids), never a live reference —
 * mirrors tenant exactly.
 */

function templatesCol(agencyId: string) {
  return getAdminDb().collection(`agencies/${agencyId}/courseThemeTemplates`);
}

function cloneThemeWithFreshIds(theme: CourseTheme): CourseTheme {
  const clone = structuredClone(theme);
  clone.body = clone.body.map((b) => ({ ...b, id: randomUUID() }));
  clone.sidebar = clone.sidebar.map((b) => ({ ...b, id: randomUUID() }));
  return clone;
}

function cloneLessonThemeWithFreshIds(theme: LessonTheme): LessonTheme {
  const clone = structuredClone(theme);
  clone.sidebar = clone.sidebar.map((b) => ({ ...b, id: randomUUID() }));
  return clone;
}

export async function saveAgencyCourseThemeTemplateServerSide(opts: {
  agencyId: string;
  name: string;
  theme: CourseTheme;
  lessonTheme?: LessonTheme;
}): Promise<CourseThemeTemplate> {
  const doc = {
    agencyId: opts.agencyId,
    name: opts.name.trim() || "Untitled template",
    theme: cloneThemeWithFreshIds(opts.theme),
    ...(opts.lessonTheme ? { lessonTheme: cloneLessonThemeWithFreshIds(opts.lessonTheme) } : {}),
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };
  const ref = await templatesCol(opts.agencyId).add(doc);
  return { id: ref.id, ...doc } as unknown as CourseThemeTemplate;
}

export async function listAgencyCourseThemeTemplates(agencyId: string): Promise<CourseThemeTemplate[]> {
  const snap = await templatesCol(agencyId).orderBy("createdAt", "desc").get();
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<CourseThemeTemplate, "id">) }));
}

export async function applyAgencyCourseThemeTemplateServerSide(opts: {
  agencyId: string;
  courseId: string;
  templateId: string;
}): Promise<void> {
  const snap = await templatesCol(opts.agencyId).doc(opts.templateId).get();
  if (!snap.exists) throw new Error("Template not found");
  const template = snap.data() as Omit<CourseThemeTemplate, "id">;
  await updateAgencyStandaloneCourseThemeServerSide({
    agencyId: opts.agencyId,
    courseId: opts.courseId,
    theme: cloneThemeWithFreshIds(template.theme),
    lessonTheme: template.lessonTheme ? cloneLessonThemeWithFreshIds(template.lessonTheme) : undefined,
  });
}

/** Same idea, applied to an Agency Course Offer instead. */
export async function applyAgencyCourseThemeTemplateToOfferServerSide(opts: {
  agencyId: string;
  offerId: string;
  templateId: string;
}): Promise<void> {
  const snap = await templatesCol(opts.agencyId).doc(opts.templateId).get();
  if (!snap.exists) throw new Error("Template not found");
  const template = snap.data() as Omit<CourseThemeTemplate, "id">;
  const theme = cloneThemeWithFreshIds(template.theme);
  theme.sidebar = theme.sidebar.filter((b) => !isCoreSidebarBlock(b));
  const { updateAgencyCourseOfferThemeServerSide } = await import("@/lib/server/agency-course-offer-service");
  await updateAgencyCourseOfferThemeServerSide({ agencyId: opts.agencyId, offerId: opts.offerId, theme });
}
