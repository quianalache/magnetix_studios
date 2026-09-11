/**
 * Skool Course -> Standalone Product import executor. DRY RUN by default;
 * real writes require APPLY=true explicitly.
 *
 * Re-extracts all real courses from the source community (via the real,
 * already-authenticated CDP-bridged Skool session), maps each into a
 * CourseImportPlan (mapping.ts), then runs the real, idempotent
 * course-importer.ts over the plans.
 *
 * Safety, both modes:
 *  - Every created Product is `published: false`.
 *  - Every auto-created companion Offer stays `visibility: "draft"` (the
 *    canonical creation flow's own default — nothing here overrides it).
 *  - Skool-hosted (native/Mux) video and Skool-hosted PDF resources are
 *    NEVER faked with a temporary/signed URL — those lessons import without
 *    that media, flagged pending for a later migration task.
 *  - No enrollments/progress are created.
 *  - The pre-existing, non-Skool-mapped "YouTube By Design (Preview)"
 *    Product is never touched or merged into by title — the real Skool
 *    "YouTube By Design" course is held back from this run entirely (see
 *    SKIP_COURSE_IDS below) pending an explicit reconciliation decision.
 *
 * Run (same NODE_OPTIONS pattern as every other admin script in this repo):
 *   NODE_OPTIONS="--require ./scripts/_server-only-shim.cjs" \
 *     CDP_PORT=9222 CDP_TAB_ID=<tab id> GROUP_SLUG=quiana \
 *     SUBACCOUNT_ID=xvnedVCmQpEvHrcPhEDI AGENCY_ID=w2xnqrCoj8djbNP2Nbgr \
 *     TARGET_GROUP_ID=TBp39lWSZJCtLguowmqB \
 *     [APPLY=true] \
 *     pnpm exec tsx scripts/skool-course-import.ts
 */
import { writeFileSync, existsSync, readFileSync } from "node:fs";

// Minimal, dependency-free .env.local loader (same shape as
// backfill-community-access-sources.ts) — Firebase Admin credentials come
// from here when this runs outside the Next.js server build. Points at the
// real checkout's absolute path, not a worktree-relative one: `.env.local`
// is gitignored, so a git-worktree copy of this repo has no copy of its own.
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

import { CdpBrowserTransport } from "../src/lib/server/skool-import/cdp-browser-transport";
import { createBrowserBridgedSkoolSession } from "../src/lib/server/skool-import/skool-session";
import { extractAllCourses } from "../src/lib/server/skool-import/skool-extract";
import {
  planStandaloneCourseImport,
  type CourseImportPlan,
} from "../src/lib/server/skool-import/mapping";
import {
  runSkoolCourseImport,
  type CourseImportReport,
} from "../src/lib/server/skool-import/course-importer";

/**
 * Skool course id -> reason. "YouTube By Design" already has a manually-
 * created, non-Skool-mapped Product ("YouTube By Design (Preview)",
 * confirmed live: already published, already linked to the target
 * Community, already bundled into its own manually-created Offer) —
 * creating a second Product for the same real course would produce a
 * confusing duplicate under a near-identical title. Title is not identity:
 * this is a single explicit reconciliation decision for the owner, not
 * something this run resolves unilaterally.
 */
const SKIP_COURSE_IDS = new Map<string, string>([
  [
    "5cea3d5dc0364d0981874f790e0055e9",
    'Pre-existing manually-created Product "YouTube By Design (Preview)" already exists for this ' +
      "Community with no Skool importMapping — held back pending an explicit reconciliation decision, " +
      "not auto-merged by title.",
  ],
]);

function summarizeReport(report: CourseImportReport) {
  return {
    commit: report.commit,
    courses: report.courses,
    offers: report.offers,
    sections: report.sections,
    lessons: report.lessons,
    videosPending: report.videosPending,
    filesPending: report.filesPending,
    errorCount: report.errors.length,
    errors: report.errors,
    reconciliationIssues: report.reconciliationIssues,
    courseResults: report.courseResults,
  };
}

async function main() {
  const cdpPort = Number(process.env.CDP_PORT ?? "9222");
  const tabId = process.env.CDP_TAB_ID;
  const groupSlug = process.env.GROUP_SLUG ?? "quiana";
  const subAccountId = process.env.SUBACCOUNT_ID;
  const agencyId = process.env.AGENCY_ID;
  const targetGroupId = process.env.TARGET_GROUP_ID;
  const apply = process.env.APPLY === "true";
  if (!tabId)
    throw new Error(
      "CDP_TAB_ID env var required — find it via curl http://127.0.0.1:9222/json/list"
    );
  if (!subAccountId) throw new Error("SUBACCOUNT_ID env var required");
  if (!agencyId) throw new Error("AGENCY_ID env var required");
  if (!targetGroupId) throw new Error("TARGET_GROUP_ID env var required");

  const transport = new CdpBrowserTransport(cdpPort, tabId);
  const session = createBrowserBridgedSkoolSession(cdpPort, tabId);
  const { courses, warnings: extractionWarnings } = await extractAllCourses(
    groupSlug,
    session
  );
  transport.close();

  if (extractionWarnings.length > 0) {
    console.log(`Extraction warnings (${extractionWarnings.length}):`);
    for (const w of extractionWarnings) console.log(" -", w);
  }

  const plans: CourseImportPlan[] = courses.map((c) =>
    planStandaloneCourseImport(c, { targetGroupId })
  );

  console.log(
    `\n=== DRY RUN (commit=false) — ${plans.length} real courses ===`
  );
  const dryRun = await runSkoolCourseImport({
    subAccountId,
    agencyId,
    targetGroupId,
    commit: false,
    plans,
    skipCourseIds: SKIP_COURSE_IDS,
  });
  const dryRunSummary = summarizeReport(dryRun);
  console.log(
    JSON.stringify(
      {
        courses: dryRunSummary.courses,
        offers: dryRunSummary.offers,
        sections: dryRunSummary.sections,
        lessons: dryRunSummary.lessons,
        videosPending: dryRunSummary.videosPending,
        filesPending: dryRunSummary.filesPending,
        errorCount: dryRunSummary.errorCount,
      },
      null,
      2
    )
  );
  writeFileSync(
    process.env.DRY_RUN_OUT_FILE ?? "/tmp/skool-course-import-dry-run.json",
    JSON.stringify(dryRunSummary, null, 2)
  );

  if (!apply) {
    console.log(
      "\nAPPLY=true not set — stopping after dry run. No Firestore writes performed."
    );
    return;
  }

  console.log(
    `\n=== REAL IMPORT (commit=true) — ${plans.length} real courses ===`
  );
  const real = await runSkoolCourseImport({
    subAccountId,
    agencyId,
    targetGroupId,
    commit: true,
    plans,
    skipCourseIds: SKIP_COURSE_IDS,
  });
  const realSummary = summarizeReport(real);
  console.log(
    JSON.stringify(
      {
        courses: realSummary.courses,
        offers: realSummary.offers,
        sections: realSummary.sections,
        lessons: realSummary.lessons,
        videosPending: realSummary.videosPending,
        filesPending: realSummary.filesPending,
        errorCount: realSummary.errorCount,
      },
      null,
      2
    )
  );
  writeFileSync(
    process.env.APPLY_OUT_FILE ?? "/tmp/skool-course-import-apply.json",
    JSON.stringify(realSummary, null, 2)
  );

  if (realSummary.errorCount > 0) {
    console.log("\nERRORS:");
    for (const e of real.errors) console.log(" -", e);
  }
  if (real.reconciliationIssues.length > 0) {
    console.log("\nRECONCILIATION ISSUES:");
    for (const r of real.reconciliationIssues) console.log(" -", r);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
