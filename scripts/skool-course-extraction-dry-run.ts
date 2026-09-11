/**
 * One-off dry-run inventory for the new Skool course/classroom extraction
 * layer (skool-extract.ts). Reads real course/module/lesson structure from
 * the real, already-authenticated Skool browser tab via CDP — see
 * cdp-browser-transport.ts for why that's the only transport that works
 * (Skool's WAF blocks a bare server-side fetch, confirmed live) — and prints
 * a SANITIZED inventory only: titles and counts, never full lesson body
 * text, per this task's own explicit constraint.
 *
 * NO Firestore writes. NO Standalone Products/Offers created. Nothing here
 * touches subAccounts/ data at all — this only reads from Skool.
 *
 * Run (same NODE_OPTIONS pattern as backfill-community-access-sources.ts —
 * "server-only" has to be stubbed BEFORE tsx starts, not from inside the
 * script it's executing):
 *   NODE_OPTIONS="--require ./scripts/_server-only-shim.cjs" \
 *     CDP_PORT=9222 CDP_TAB_ID=<tab id from /json/list> GROUP_SLUG=quiana \
 *     pnpm exec tsx scripts/skool-course-extraction-dry-run.ts
 */
import { CdpBrowserTransport } from "../src/lib/server/skool-import/cdp-browser-transport";
import { createBrowserBridgedSkoolSession } from "../src/lib/server/skool-import/skool-session";
import { extractAllCourses } from "../src/lib/server/skool-import/skool-extract";
import type {
  SkoolCourse,
  SkoolCourseUnit,
  SkoolLesson,
} from "../src/lib/server/skool-import/types";
import { writeFileSync } from "node:fs";

function countLessons(units: SkoolCourseUnit[]): SkoolLesson[] {
  const out: SkoolLesson[] = [];
  for (const u of units) {
    if (u.type === "lesson") out.push(u.lesson);
    else out.push(...u.section.lessons);
  }
  return out;
}

function videoBreakdown(lessons: SkoolLesson[]): {
  native: number;
  external: number;
  none: number;
} {
  const b = { native: 0, external: 0, none: 0 };
  for (const l of lessons) {
    if (l.video.kind === "native") b.native += 1;
    else if (l.video.kind === "external") b.external += 1;
    else b.none += 1;
  }
  return b;
}

function summarizeCourse(course: SkoolCourse) {
  const sections = course.units.filter((u) => u.type === "section");
  const flatLessons = course.units.filter((u) => u.type === "lesson");
  const allLessons = countLessons(course.units);
  const video = videoBreakdown(allLessons);
  return {
    skoolCourseId: course.skoolCourseId,
    title: course.title,
    published: course.published,
    minTier: course.minTier,
    privacy: course.privacy,
    sectionCount: sections.length,
    flatLessonCount: flatLessons.length,
    totalLessonCount: allLessons.length,
    lessonsWithBody: allLessons.filter((l) => l.bodyRichText !== null).length,
    lessonsWithResources: allLessons.filter((l) => l.resources.length > 0)
      .length,
    resourceKinds: allLessons.reduce(
      (acc, l) => {
        for (const r of l.resources) acc[r.kind] = (acc[r.kind] ?? 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    ),
    video,
    sectionTitles: sections.map((u) =>
      u.type === "section" ? u.section.title : ""
    ),
    // Titles only — no body content, per this task's own constraint.
    lessonTitles: allLessons.map((l) => l.title),
  };
}

async function main() {
  const cdpPort = Number(process.env.CDP_PORT ?? "9222");
  const tabId = process.env.CDP_TAB_ID;
  const groupSlug = process.env.GROUP_SLUG ?? "quiana";
  if (!tabId) {
    throw new Error(
      "CDP_TAB_ID env var required — find it via curl http://127.0.0.1:9222/json/list"
    );
  }

  const transport = new CdpBrowserTransport(cdpPort, tabId);
  const session = createBrowserBridgedSkoolSession(cdpPort, tabId);

  const { summaries, courses, warnings } = await extractAllCourses(
    groupSlug,
    session
  );
  transport.close();

  const bySkoolId = new Map(courses.map((c) => [c.skoolCourseId, c]));
  const report = {
    groupSlug,
    fetchedAtIso: new Date().toISOString(),
    indexCourseCount: summaries.length,
    extractedCourseCount: courses.length,
    courses: summaries.map((s) => {
      const course = bySkoolId.get(s.skoolCourseId);
      return {
        indexTitle: s.title,
        indexNumModules: s.indexNumModules,
        indexState: s.state,
        indexPublic: s.public,
        extracted: course ? summarizeCourse(course) : null,
      };
    }),
    warnings,
  };

  const outPath =
    process.env.OUT_FILE ?? "/tmp/skool-course-extraction-report.json";
  writeFileSync(outPath, JSON.stringify(report, null, 2));

  console.log(`Courses in classroom index: ${summaries.length}`);
  console.log(`Courses successfully extracted: ${courses.length}`);
  console.log(`Warnings: ${warnings.length}`);
  for (const w of warnings) console.log(`  - ${w}`);
  console.log(`\nFull sanitized report written to ${outPath}`);
  for (const c of report.courses) {
    const e = c.extracted;
    console.log(
      `\n"${c.indexTitle}" — published=${e?.published ?? "?"} sections=${e?.sectionCount ?? "?"} ` +
        `flatLessons=${e?.flatLessonCount ?? "?"} totalLessons=${e?.totalLessonCount ?? "?"} ` +
        `video(native=${e?.video.native ?? 0},external=${e?.video.external ?? 0},none=${e?.video.none ?? 0})`
    );
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
