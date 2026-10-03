/**
 * Unified Chart Designs — freeze the chart styling of previously generated
 * reports (see scripts/lib/generated-report-style-freeze-runner.ts). It
 * records each report's CURRENT appearance; original generation-time
 * styling was never saved and can't be recovered.
 *
 *   Dry run (default, reads only):
 *     pnpm exec tsx scripts/freeze-generated-report-styles.ts --env-file <path/.env.local>
 *   Live (authorized runs only — must match the dry run's count):
 *     pnpm exec tsx scripts/freeze-generated-report-styles.ts --env-file <path> --live --expect N
 */
import { argValue, scriptFirestore } from "./lib/script-firestore";
import { runGeneratedReportStyleFreeze } from "./lib/generated-report-style-freeze-runner";

async function main() {
  const live = process.argv.includes("--live");
  const { db, target } = scriptFirestore();
  console.log(`=== Freeze generated-report chart styles — ${live ? "LIVE" : "DRY RUN"} — ${target} ===\n`);
  const expectRaw = argValue("--expect");
  const expect = expectRaw && /^\d+$/.test(expectRaw) ? Number(expectRaw) : undefined;
  const result = await runGeneratedReportStyleFreeze({ db, live, expect });
  for (const item of result.plan) {
    console.log(`  report ${item.reportId} (sub-account ${item.subAccountId}): ${item.chartStyles ? "WILL FREEZE" : "SKIP"} — ${item.note}`);
  }
  const n = result.plan.filter((p) => p.chartStyles).length;
  console.log(`\nReports to freeze: ${n}`);
  if (!live) {
    console.log(`DRY RUN — zero writes. Authorized run: --live --expect ${n}`);
    return;
  }
  if (result.refused) {
    console.error(`REFUSED: ${result.refused}`);
    process.exitCode = 1;
    return;
  }
  console.log(`Frozen: ${result.frozen.length} (${result.frozen.join(", ") || "none"})`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
