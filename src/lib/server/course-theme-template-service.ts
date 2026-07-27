import "server-only";

import { randomUUID } from "crypto";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { updateStandaloneCourseThemeServerSide } from "@/lib/server/standalone-course-service";
import { updateCourseOfferThemeServerSide } from "@/lib/server/course-offer-service";
import { isCoreSidebarBlock } from "@/types/course-theme";
import type { CourseTheme, CourseThemeTemplate, LessonTheme } from "@/types/course-theme";

/**
 * Reusable course-theme templates — scoped to one sub-account (not
 * shareable across businesses/agencies, per product decision), stored at
 * `subAccounts/{saId}/courseThemeTemplates/{templateId}`, matching the
 * modern subcollection tenancy convention (`communityGroups`,
 * `standaloneCourses`).
 *
 * Applying a template is a deep COPY onto the target course's `theme` field
 * (fresh block ids regenerated), never a live reference — mirrors Agency
 * Snapshots' capture/apply pattern (`src/lib/snapshots/`). Editing a template
 * later must not retroactively change courses that already used it.
 */

function templatesCol(saId: string) {
  return getAdminDb().collection(`subAccounts/${saId}/courseThemeTemplates`);
}

/** Deep-clones a theme and regenerates every block's id, so applying the
 *  same template twice (or to two different courses) never collides. */
function cloneThemeWithFreshIds(theme: CourseTheme): CourseTheme {
  const clone = structuredClone(theme);
  clone.body = clone.body.map((b) => ({ ...b, id: randomUUID() }));
  clone.sidebar = clone.sidebar.map((b) => ({ ...b, id: randomUUID() }));
  return clone;
}

/** Same idea for the Lesson page's theme — only its `sidebar` is a block
 *  list (Body is 3 fixed sections, no ids to regenerate). */
function cloneLessonThemeWithFreshIds(theme: LessonTheme): LessonTheme {
  const clone = structuredClone(theme);
  clone.sidebar = clone.sidebar.map((b) => ({ ...b, id: randomUUID() }));
  return clone;
}

export async function saveCourseThemeTemplateServerSide(opts: {
  subAccountId: string;
  agencyId: string;
  name: string;
  theme: CourseTheme;
  /** Optional — a template saved from an Offer's editor has no Lesson page
   *  to capture (Offers have no lessons of their own). */
  lessonTheme?: LessonTheme;
}): Promise<CourseThemeTemplate> {
  const doc = {
    subAccountId: opts.subAccountId,
    agencyId: opts.agencyId,
    name: opts.name.trim() || "Untitled template",
    theme: cloneThemeWithFreshIds(opts.theme),
    ...(opts.lessonTheme ? { lessonTheme: cloneLessonThemeWithFreshIds(opts.lessonTheme) } : {}),
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };
  const ref = await templatesCol(opts.subAccountId).add(doc);
  return { id: ref.id, ...doc } as CourseThemeTemplate;
}

export async function listCourseThemeTemplates(
  subAccountId: string,
): Promise<CourseThemeTemplate[]> {
  const snap = await templatesCol(subAccountId)
    .orderBy("createdAt", "desc")
    .get();
  return snap.docs.map(
    (d) => ({ id: d.id, ...(d.data() as Omit<CourseThemeTemplate, "id">) }),
  );
}

export async function applyCourseThemeTemplateServerSide(opts: {
  subAccountId: string;
  courseId: string;
  templateId: string;
}): Promise<void> {
  const snap = await templatesCol(opts.subAccountId).doc(opts.templateId).get();
  if (!snap.exists) throw new Error("Template not found");
  const template = snap.data() as Omit<CourseThemeTemplate, "id">;
  await updateStandaloneCourseThemeServerSide({
    subAccountId: opts.subAccountId,
    courseId: opts.courseId,
    theme: cloneThemeWithFreshIds(template.theme),
    lessonTheme: template.lessonTheme
      ? cloneLessonThemeWithFreshIds(template.lessonTheme)
      : undefined,
  });
}

/**
 * Same idea, applied to a Course Offer instead — templates are fully
 * generic (`{name, theme}`, no course-specific reference), so any template
 * saved from a course's theme editor can be applied to an offer and vice
 * versa. `progress`/`instructor` core sidebar blocks are stripped here: they
 * don't map onto an Offer, which can bundle several courses at once (see
 * `DEFAULT_OFFER_THEME`'s doc comment).
 */
export async function applyCourseThemeTemplateToOfferServerSide(opts: {
  subAccountId: string;
  offerId: string;
  templateId: string;
}): Promise<void> {
  const snap = await templatesCol(opts.subAccountId).doc(opts.templateId).get();
  if (!snap.exists) throw new Error("Template not found");
  const template = snap.data() as Omit<CourseThemeTemplate, "id">;
  const theme = cloneThemeWithFreshIds(template.theme);
  theme.sidebar = theme.sidebar.filter((b) => !isCoreSidebarBlock(b));
  await updateCourseOfferThemeServerSide({
    subAccountId: opts.subAccountId,
    offerId: opts.offerId,
    theme,
  });
}
