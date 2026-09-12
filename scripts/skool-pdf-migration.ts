/**
 * Skool-hosted PDF resource migration. DRY RUN by default; real writes
 * require APPLY=true. Re-extracts all real courses live, maps them, resolves
 * each course's real Magnetix id from the existing standalone_courses
 * importMapping (never creates a course/section/lesson itself), then runs
 * runSkoolPdfResourceMigration (media-migration.ts).
 *
 * Run:
 *   NODE_OPTIONS="--require ./scripts/_server-only-shim.cjs" \
 *     CDP_PORT=9222 CDP_TAB_ID=<tab id> GROUP_SLUG=quiana \
 *     SUBACCOUNT_ID=xvnedVCmQpEvHrcPhEDI TARGET_GROUP_ID=TBp39lWSZJCtLguowmqB \
 *     [APPLY=true] [ONLY_FILE_ID=<skool file id>] \
 *     pnpm exec tsx scripts/skool-pdf-migration.ts
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

import { CdpBrowserTransport } from "../src/lib/server/skool-import/cdp-browser-transport";
import { createBrowserBridgedSkoolSession } from "../src/lib/server/skool-import/skool-session";
import { extractAllCourses } from "../src/lib/server/skool-import/skool-extract";
import {
  planStandaloneCourseImport,
  type CourseImportPlan,
} from "../src/lib/server/skool-import/mapping";
import { runSkoolPdfResourceMigration } from "../src/lib/server/skool-import/media-migration";
import { getExistingMappingsBulk } from "../src/lib/server/skool-import/import-mappings";

async function main() {
  const cdpPort = Number(process.env.CDP_PORT ?? "9222");
  const tabId = process.env.CDP_TAB_ID;
  const groupSlug = process.env.GROUP_SLUG ?? "quiana";
  const subAccountId = process.env.SUBACCOUNT_ID;
  const targetGroupId = process.env.TARGET_GROUP_ID;
  const apply = process.env.APPLY === "true";
  const onlyFileId = process.env.ONLY_FILE_ID;
  if (!tabId) throw new Error("CDP_TAB_ID env var required");
  if (!subAccountId) throw new Error("SUBACCOUNT_ID env var required");
  if (!targetGroupId) throw new Error("TARGET_GROUP_ID env var required");

  const transport = new CdpBrowserTransport(cdpPort, tabId);
  const session = createBrowserBridgedSkoolSession(cdpPort, tabId);
  const { courses } = await extractAllCourses(groupSlug, session);

  const plans: CourseImportPlan[] = courses.map((c) =>
    planStandaloneCourseImport(c, { targetGroupId })
  );
  const courseMappings = await getExistingMappingsBulk(
    subAccountId,
    "standalone_courses",
    plans.map((p) => p.skoolCourseId)
  );

  let coursesWithMappings = plans
    .map((plan) => {
      const mapping = courseMappings.get(plan.skoolCourseId);
      return mapping
        ? {
            skoolCourseId: plan.skoolCourseId,
            magnetixCourseId: mapping.leadstackId,
            plan,
          }
        : null;
    })
    .filter(
      (
        c
      ): c is {
        skoolCourseId: string;
        magnetixCourseId: string;
        plan: CourseImportPlan;
      } => c !== null
    );

  if (onlyFileId) {
    coursesWithMappings = coursesWithMappings
      .map((c) => ({
        ...c,
        plan: {
          ...c.plan,
          lessons: c.plan.lessons.filter((l) =>
            l.resources.rehostRequired.some((r) => r.fileId === onlyFileId)
          ),
        },
      }))
      .filter((c) => c.plan.lessons.length > 0);
    console.log(
      `ONLY_FILE_ID set — restricting to file ${onlyFileId}, ${coursesWithMappings.length} matching course(s).`
    );
  }

  const unmappedCount = plans.length - courseMappings.size;
  if (unmappedCount > 0) {
    console.log(
      `Note: ${unmappedCount} of ${plans.length} courses have no standalone_courses mapping yet — their resources are skipped this run.`
    );
  }

  console.log(`\n=== DRY RUN (commit=false) ===`);
  const dryRun = await runSkoolPdfResourceMigration({
    subAccountId,
    commit: false,
    session,
    courses: coursesWithMappings,
  });
  console.log(JSON.stringify(dryRun.counts, null, 2));
  writeFileSync(
    process.env.DRY_RUN_OUT_FILE ?? "/tmp/skool-pdf-migration-dry-run.json",
    JSON.stringify(dryRun, null, 2)
  );

  if (!apply) {
    transport.close();
    console.log(
      "\nAPPLY=true not set — stopping after dry run. No Firestore/Storage writes performed."
    );
    return;
  }

  console.log(`\n=== REAL MIGRATION (commit=true) ===`);
  const real = await runSkoolPdfResourceMigration({
    subAccountId,
    commit: true,
    session,
    courses: coursesWithMappings,
  });
  transport.close();
  console.log(JSON.stringify(real.counts, null, 2));
  writeFileSync(
    process.env.APPLY_OUT_FILE ?? "/tmp/skool-pdf-migration-apply.json",
    JSON.stringify(real, null, 2)
  );
  const failed = real.results.filter((r) => r.action === "failed");
  if (failed.length > 0) {
    console.log("\nFAILED:");
    failed.forEach((f) =>
      console.log(" -", f.skoolFileId, f.fileName, f.error)
    );
  }
  const migrated = real.results.filter((r) => r.action === "migrated");
  if (migrated.length > 0) {
    console.log("\nMIGRATED:");
    migrated.forEach((m) =>
      console.log(" -", m.fileName, m.sizeBytes, "bytes ->", m.permanentUrl)
    );
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
