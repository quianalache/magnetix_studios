import "server-only";

import { randomUUID } from "crypto";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { updateStandaloneCourseThemeServerSide } from "@/lib/server/standalone-course-service";
import type { CourseTheme, CourseThemeTemplate } from "@/types/course-theme";

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

export async function saveCourseThemeTemplateServerSide(opts: {
  subAccountId: string;
  agencyId: string;
  name: string;
  theme: CourseTheme;
}): Promise<CourseThemeTemplate> {
  const doc = {
    subAccountId: opts.subAccountId,
    agencyId: opts.agencyId,
    name: opts.name.trim() || "Untitled template",
    theme: cloneThemeWithFreshIds(opts.theme),
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
  });
}
