/**
 * Skool Course -> Standalone Product mapping dry-run. Re-extracts all real
 * courses from the source community (via the real, already-authenticated
 * CDP-bridged Skool session — see skool-course-extraction-dry-run.ts) and
 * runs the real, pure planStandaloneCourseImport (mapping.ts) over each one.
 *
 * NO Firestore writes of any kind. NO Standalone Products/Offers/sections/
 * lessons/importMappings created. This produces a PLAN only, printed and
 * saved as a sanitized JSON report (titles + counts, never full lesson body
 * text).
 *
 * Run (same NODE_OPTIONS pattern as the extraction dry-run — "server-only"
 * has to be stubbed BEFORE tsx starts):
 *   NODE_OPTIONS="--require ./scripts/_server-only-shim.cjs" \
 *     CDP_PORT=9222 CDP_TAB_ID=<tab id from /json/list> GROUP_SLUG=quiana \
 *     TARGET_GROUP_ID=TBp39lWSZJCtLguowmqB \
 *     pnpm exec tsx scripts/skool-course-mapping-dry-run.ts
 */
import { writeFileSync } from "node:fs";
import { CdpBrowserTransport } from "../src/lib/server/skool-import/cdp-browser-transport";
import { createBrowserBridgedSkoolSession } from "../src/lib/server/skool-import/skool-session";
import { extractAllCourses } from "../src/lib/server/skool-import/skool-extract";
import {
  planStandaloneCourseImport,
  type CourseImportPlan,
} from "../src/lib/server/skool-import/mapping";
import type { SkoolCourse } from "../src/lib/server/skool-import/types";

function summarizePlan(plan: CourseImportPlan) {
  const externalVideoCount = plan.lessons.filter(
    (l) => l.video.readiness === "importable"
  ).length;
  const skoolVideoCount = plan.lessons.filter(
    (l) => l.video.readiness === "requires-video-migration"
  ).length;
  const externalResourceCount = plan.lessons.reduce(
    (n, l) => n + l.resources.resourceLinks.length,
    0
  );
  const rehostRequiredCount = plan.lessons.reduce(
    (n, l) => n + l.resources.rehostRequired.length,
    0
  );
  return {
    skoolCourseId: plan.skoolCourseId,
    title: plan.title,
    sourcePublished: plan.sourcePublished,
    plannedAccess: plan.plannedAccess,
    plannedPublished: plan.plannedPublished,
    linkedCommunityGroupIds: plan.linkedCommunityGroupIds,
    sectionCount: plan.sections.length,
    flatLessonCount: plan.lessons.filter((l) => l.sectionSkoolId === null)
      .length,
    totalLessonCount: plan.lessons.length,
    externalVideoCount,
    skoolVideoCount,
    externalResourceCount,
    rehostRequiredCount,
    coverUrlClassification: plan.coverUrlClassification,
    minTierSourceSignal: plan.minTierSourceSignal,
    expectedOffer: plan.expectedOffer,
    mappingKey: plan.mappingKey,
    readiness: plan.readiness,
    warningCount: plan.warnings.length,
    warnings: plan.warnings,
  };
}

/** Verifies every real lesson/section/course id in the extracted dataset is
 *  unique — the actual evidence behind this task's §15 idempotency-key
 *  question, not an assumption. */
function checkIdUniqueness(courses: SkoolCourse[]) {
  const courseIds = new Set<string>();
  const sectionIds = new Set<string>();
  const lessonIds = new Set<string>();
  const dupes: string[] = [];
  for (const c of courses) {
    if (courseIds.has(c.skoolCourseId)) dupes.push(`course ${c.skoolCourseId}`);
    courseIds.add(c.skoolCourseId);
    for (const unit of c.units) {
      if (unit.type === "section") {
        if (sectionIds.has(unit.section.skoolSectionId))
          dupes.push(`section ${unit.section.skoolSectionId}`);
        sectionIds.add(unit.section.skoolSectionId);
        for (const lesson of unit.section.lessons) {
          if (lessonIds.has(lesson.skoolLessonId))
            dupes.push(`lesson ${lesson.skoolLessonId}`);
          lessonIds.add(lesson.skoolLessonId);
        }
      } else {
        if (lessonIds.has(unit.lesson.skoolLessonId))
          dupes.push(`lesson ${unit.lesson.skoolLessonId}`);
        lessonIds.add(unit.lesson.skoolLessonId);
      }
    }
  }
  return {
    uniqueCourseIds: courseIds.size,
    uniqueSectionIds: sectionIds.size,
    uniqueLessonIds: lessonIds.size,
    duplicates: dupes,
  };
}

async function main() {
  const cdpPort = Number(process.env.CDP_PORT ?? "9222");
  const tabId = process.env.CDP_TAB_ID;
  const groupSlug = process.env.GROUP_SLUG ?? "quiana";
  const targetGroupId = process.env.TARGET_GROUP_ID;
  if (!tabId)
    throw new Error(
      "CDP_TAB_ID env var required — find it via curl http://127.0.0.1:9222/json/list"
    );
  if (!targetGroupId) throw new Error("TARGET_GROUP_ID env var required");

  const transport = new CdpBrowserTransport(cdpPort, tabId);
  const session = createBrowserBridgedSkoolSession(cdpPort, tabId);

  const {
    summaries,
    courses,
    warnings: extractionWarnings,
  } = await extractAllCourses(groupSlug, session);
  transport.close();

  const idCheck = checkIdUniqueness(courses);

  const plans: {
    plan: CourseImportPlan | null;
    error: string | null;
    sourceTitle: string;
    skoolCourseId: string;
  }[] = [];
  for (const course of courses) {
    try {
      const plan = planStandaloneCourseImport(course, { targetGroupId });
      plans.push({
        plan,
        error: null,
        sourceTitle: course.title,
        skoolCourseId: course.skoolCourseId,
      });
    } catch (err) {
      plans.push({
        plan: null,
        error: err instanceof Error ? err.message : String(err),
        sourceTitle: course.title,
        skoolCourseId: course.skoolCourseId,
      });
    }
  }

  // Determinism check: run the same mapping a second time over the SAME
  // already-extracted in-memory data (no re-fetch) and diff the resulting
  // plans' JSON — must be byte-identical.
  const secondPass = courses.map((c) =>
    planStandaloneCourseImport(c, { targetGroupId })
  );
  const firstPassJson = plans.map((p) => JSON.stringify(p.plan));
  const secondPassJson = secondPass.map((p) => JSON.stringify(p));
  const deterministic =
    JSON.stringify(firstPassJson) === JSON.stringify(secondPassJson);

  // Entity check: every real lesson represented exactly once across all plans.
  const allPlannedLessonIds = plans.flatMap(
    (p) => p.plan?.lessons.map((l) => l.skoolLessonId) ?? []
  );
  const uniquePlannedLessonIds = new Set(allPlannedLessonIds);
  const totalLessonsExtracted = idCheck.uniqueLessonIds;

  const readinessBuckets = {
    "ready-for-content-import": [] as string[],
    "ready-except-media": [] as string[],
    "needs-manual-access-decision": [] as string[],
    blocked: [] as string[],
  };
  for (const p of plans) {
    if (p.plan) readinessBuckets[p.plan.readiness].push(p.plan.title);
    else readinessBuckets.blocked.push(p.sourceTitle);
  }

  const report = {
    groupSlug,
    targetGroupId,
    fetchedAtIso: new Date().toISOString(),
    indexCourseCount: summaries.length,
    extractedCourseCount: courses.length,
    extractionWarningCount: extractionWarnings.length,
    idUniqueness: idCheck,
    entityCheck: {
      totalLessonsExtracted,
      totalLessonsPlanned: allPlannedLessonIds.length,
      uniqueLessonsPlanned: uniquePlannedLessonIds.size,
      allLessonsRepresentedExactlyOnce:
        allPlannedLessonIds.length === totalLessonsExtracted &&
        uniquePlannedLessonIds.size === totalLessonsExtracted,
    },
    deterministic,
    readinessBuckets,
    readinessCounts: {
      readyForContentImport:
        readinessBuckets["ready-for-content-import"].length,
      readyExceptMedia: readinessBuckets["ready-except-media"].length,
      needsManualAccessDecision:
        readinessBuckets["needs-manual-access-decision"].length,
      blocked: readinessBuckets.blocked.length,
    },
    courses: plans.map((p) => ({
      skoolCourseId: p.skoolCourseId,
      sourceTitle: p.sourceTitle,
      error: p.error,
      plan: p.plan ? summarizePlan(p.plan) : null,
    })),
  };

  const outPath =
    process.env.OUT_FILE ?? "/tmp/skool-course-mapping-report.json";
  writeFileSync(outPath, JSON.stringify(report, null, 2));

  console.log(
    `Courses extracted: ${courses.length} (index reported ${summaries.length})`
  );
  console.log(`Deterministic (2 passes identical): ${deterministic}`);
  console.log(
    `ID uniqueness: courses=${idCheck.uniqueCourseIds} sections=${idCheck.uniqueSectionIds} lessons=${idCheck.uniqueLessonIds} duplicates=${idCheck.duplicates.length}`
  );
  console.log(
    `Entity check: extracted=${totalLessonsExtracted} planned=${allPlannedLessonIds.length} unique=${uniquePlannedLessonIds.size} allRepresentedExactlyOnce=${report.entityCheck.allLessonsRepresentedExactlyOnce}`
  );
  console.log(
    `\nReadiness: ready=${report.readinessCounts.readyForContentImport} media=${report.readinessCounts.readyExceptMedia} access=${report.readinessCounts.needsManualAccessDecision} blocked=${report.readinessCounts.blocked}`
  );
  console.log(`\nFull sanitized report written to ${outPath}\n`);
  for (const c of report.courses) {
    const p = c.plan;
    if (!p) {
      console.log(`"${c.sourceTitle}" — ERROR: ${c.error}`);
      continue;
    }
    console.log(
      `"${p.title}" [${p.readiness}] — sections=${p.sectionCount} flatLessons=${p.flatLessonCount} totalLessons=${p.totalLessonCount} ` +
        `video(external=${p.externalVideoCount},skoolHosted=${p.skoolVideoCount}) resources(external=${p.externalResourceCount},rehost=${p.rehostRequiredCount}) ` +
        `minTier=${p.minTierSourceSignal} warnings=${p.warningCount}`
    );
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
