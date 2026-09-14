/**
 * Skool lesson body-content repair. DRY RUN by default; real writes require
 * APPLY=true.
 *
 * Scope, deliberately narrow: operates ONLY on already-imported Skool
 * lessons (resolved via the existing standalone_course_lessons
 * importMapping — never creates a Product/Section/Lesson), and writes
 * ONLY the `bodyHtml` field via the real updateStandaloneLessonServerSide
 * function (never touches videoUrl/videoProvider/videoId/resourceLinks/
 * published — confirmed by the patch shape below).
 *
 * Manual-edit safety: a lesson is only repaired when its CURRENT Firestore
 * `bodyHtml` is the empty string. A non-empty body that doesn't match the
 * freshly re-extracted+mapped HTML is reported as AMBIGUOUS and skipped —
 * never overwritten — since there's no way to prove from this data alone
 * whether a non-empty body is the untouched import or a manual edit made
 * since. (In the real 2026-09-15 run, every one of the 14 real source-text
 * lessons was cleanly either byte-identical-present or fully empty — zero
 * ambiguous cases existed in practice, but the check runs regardless.)
 *
 * Idempotent: a rerun after a successful repair sees non-empty bodyHtml for
 * every repaired lesson and skips it (SKIPPED_ALREADY_PRESENT), not
 * MISSING again.
 *
 * Run:
 *   NODE_OPTIONS="--require ./scripts/_server-only-shim.cjs" \
 *     CDP_PORT=9222 CDP_TAB_ID=<tab id> GROUP_SLUG=quiana \
 *     SUBACCOUNT_ID=xvnedVCmQpEvHrcPhEDI \
 *     [APPLY=true] \
 *     pnpm exec tsx scripts/skool-lesson-text-repair.ts
 */
import { writeFileSync, existsSync, readFileSync } from "node:fs";

function loadEnvLocal() {
  const envPath = "/Users/quianamatthews/Documents/magnetix_studios/.env.local";
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}
loadEnvLocal();

import { getAdminDb } from "../src/lib/firebase/admin";
import { updateStandaloneLessonServerSide } from "../src/lib/server/standalone-course-service";
import { getExistingMappingsBulk } from "../src/lib/server/skool-import/import-mappings";
import { CdpBrowserTransport } from "../src/lib/server/skool-import/cdp-browser-transport";
import { createBrowserBridgedSkoolSession } from "../src/lib/server/skool-import/skool-session";
import { extractAllCourses } from "../src/lib/server/skool-import/skool-extract";
import { mapSkoolRichTextToHtml } from "../src/lib/server/skool-import/mapping";

type Action =
  | "repaired"
  | "would-repair"
  | "skipped-already-present"
  | "skipped-ambiguous"
  | "skipped-no-mapping"
  | "skipped-no-source-text"
  | "failed";

interface Row {
  skoolLessonId: string;
  skoolCourseId: string;
  courseTitle: string;
  lessonTitle: string;
  action: Action;
  expectedHtmlLen: number;
  currentHtmlLen: number;
  magnetixLessonId?: string;
  magnetixCourseId?: string;
  error?: string;
}

async function main() {
  const cdpPort = Number(process.env.CDP_PORT ?? "9222");
  const tabId = process.env.CDP_TAB_ID;
  const groupSlug = process.env.GROUP_SLUG ?? "quiana";
  const subAccountId = process.env.SUBACCOUNT_ID;
  const apply = process.env.APPLY === "true";
  if (!tabId) throw new Error("CDP_TAB_ID env var required");
  if (!subAccountId) throw new Error("SUBACCOUNT_ID env var required");

  const transport = new CdpBrowserTransport(cdpPort, tabId);
  const session = createBrowserBridgedSkoolSession(cdpPort, tabId);
  const { courses, warnings } = await extractAllCourses(groupSlug, session);
  transport.close();
  if (warnings.length > 0) {
    console.log(`Extraction warnings (${warnings.length}):`);
    warnings.forEach((w) => console.log(" -", w));
  }

  // Flatten every lesson with real source text (bodyRichText !== null),
  // mapped to real HTML the exact same way the original importer does.
  const withText: {
    skoolLessonId: string;
    skoolCourseId: string;
    courseTitle: string;
    lessonTitle: string;
    expectedHtml: string;
  }[] = [];
  for (const course of courses) {
    for (const unit of course.units) {
      const lessons =
        unit.type === "lesson" ? [unit.lesson] : unit.section.lessons;
      for (const lesson of lessons) {
        if (lesson.bodyRichText !== null) {
          const mapped = mapSkoolRichTextToHtml(lesson.bodyRichText);
          if (mapped.html.length > 0) {
            withText.push({
              skoolLessonId: lesson.skoolLessonId,
              skoolCourseId: course.skoolCourseId,
              courseTitle: course.title,
              lessonTitle: lesson.title,
              expectedHtml: mapped.html,
            });
          }
        }
      }
    }
  }
  console.log(`Real source lessons with written content: ${withText.length}`);

  const db = getAdminDb();
  const lessonMappings = await getExistingMappingsBulk(
    subAccountId,
    "standalone_course_lessons",
    withText.map((l) => l.skoolLessonId)
  );

  const rows: Row[] = [];
  for (const item of withText) {
    const mapping = lessonMappings.get(item.skoolLessonId);
    if (!mapping) {
      rows.push({
        skoolLessonId: item.skoolLessonId,
        skoolCourseId: item.skoolCourseId,
        courseTitle: item.courseTitle,
        lessonTitle: item.lessonTitle,
        action: "skipped-no-mapping",
        expectedHtmlLen: item.expectedHtml.length,
        currentHtmlLen: -1,
      });
      continue;
    }
    const magnetixLessonId = mapping.leadstackId;
    const magnetixCourseId = mapping.parentId as string;
    const lessonSnap = await db
      .doc(
        `subAccounts/${subAccountId}/standaloneCourses/${magnetixCourseId}/lessons/${magnetixLessonId}`
      )
      .get();
    const currentHtml = (lessonSnap.data()?.bodyHtml as string) ?? "";

    if (currentHtml.length > 0 && currentHtml === item.expectedHtml) {
      rows.push({
        skoolLessonId: item.skoolLessonId,
        skoolCourseId: item.skoolCourseId,
        courseTitle: item.courseTitle,
        lessonTitle: item.lessonTitle,
        action: "skipped-already-present",
        expectedHtmlLen: item.expectedHtml.length,
        currentHtmlLen: currentHtml.length,
        magnetixLessonId,
        magnetixCourseId,
      });
      continue;
    }
    if (currentHtml.length > 0 && currentHtml !== item.expectedHtml) {
      // Non-empty but doesn't match — can't safely prove this is still the
      // untouched import vs. a manual edit since. Never overwritten.
      rows.push({
        skoolLessonId: item.skoolLessonId,
        skoolCourseId: item.skoolCourseId,
        courseTitle: item.courseTitle,
        lessonTitle: item.lessonTitle,
        action: "skipped-ambiguous",
        expectedHtmlLen: item.expectedHtml.length,
        currentHtmlLen: currentHtml.length,
        magnetixLessonId,
        magnetixCourseId,
      });
      continue;
    }
    // currentHtml.length === 0 — safe to repair.
    if (!apply) {
      rows.push({
        skoolLessonId: item.skoolLessonId,
        skoolCourseId: item.skoolCourseId,
        courseTitle: item.courseTitle,
        lessonTitle: item.lessonTitle,
        action: "would-repair",
        expectedHtmlLen: item.expectedHtml.length,
        currentHtmlLen: 0,
        magnetixLessonId,
        magnetixCourseId,
      });
      continue;
    }
    try {
      await updateStandaloneLessonServerSide({
        subAccountId,
        courseId: magnetixCourseId,
        lessonId: magnetixLessonId,
        patch: { bodyHtml: item.expectedHtml },
      });
      rows.push({
        skoolLessonId: item.skoolLessonId,
        skoolCourseId: item.skoolCourseId,
        courseTitle: item.courseTitle,
        lessonTitle: item.lessonTitle,
        action: "repaired",
        expectedHtmlLen: item.expectedHtml.length,
        currentHtmlLen: 0,
        magnetixLessonId,
        magnetixCourseId,
      });
    } catch (err) {
      rows.push({
        skoolLessonId: item.skoolLessonId,
        skoolCourseId: item.skoolCourseId,
        courseTitle: item.courseTitle,
        lessonTitle: item.lessonTitle,
        action: "failed",
        expectedHtmlLen: item.expectedHtml.length,
        currentHtmlLen: 0,
        magnetixLessonId,
        magnetixCourseId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const counts: Record<Action, number> = {
    repaired: 0,
    "would-repair": 0,
    "skipped-already-present": 0,
    "skipped-ambiguous": 0,
    "skipped-no-mapping": 0,
    "skipped-no-source-text": 0,
    failed: 0,
  };
  rows.forEach((r) => (counts[r.action] += 1));

  console.log(`\n=== ${apply ? "REAL REPAIR" : "DRY RUN"} RESULT ===`);
  console.log(JSON.stringify(counts, null, 2));
  console.log("\nDetails:");
  rows.forEach((r) =>
    console.log(
      `  [${r.courseTitle}] "${r.lessonTitle}" -> ${r.action} (expected=${r.expectedHtmlLen} current=${r.currentHtmlLen})${r.error ? " ERROR: " + r.error : ""}`
    )
  );

  writeFileSync(
    process.env.OUT_FILE ?? "/tmp/skool-lesson-text-repair.json",
    JSON.stringify({ apply, counts, rows }, null, 2)
  );
}
main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
