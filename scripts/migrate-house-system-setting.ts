/**
 * Unified Chart Designs — save each workspace's current Astrology house
 * system as the reading calculation setting (see
 * scripts/lib/house-system-setting-runner.ts). Values are unchanged; only
 * where they're stored changes. Existing readings are never touched.
 *
 *   Dry run (default, reads only):
 *     pnpm exec tsx scripts/migrate-house-system-setting.ts --env-file <path/.env.local>
 *   Live (authorized runs only — must match the dry run's count):
 *     pnpm exec tsx scripts/migrate-house-system-setting.ts --env-file <path> --live --expect N --manifest <out.json>
 *   Rollback (dry run unless --live):
 *     pnpm exec tsx scripts/migrate-house-system-setting.ts --env-file <path> --rollback <manifest.json> [--live]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { argValue, scriptFirestore } from "./lib/script-firestore";
import {
  rollbackHouseSystemSetting,
  runHouseSystemSetting,
  type HouseSettingPlanItem,
} from "./lib/house-system-setting-runner";

async function main() {
  const live = process.argv.includes("--live");
  const { db, target } = scriptFirestore();
  console.log(`=== House system → reading calculation setting — ${live ? "LIVE" : "DRY RUN"} — ${target} ===\n`);

  const rollbackPath = argValue("--rollback");
  if (rollbackPath) {
    const manifest = JSON.parse(readFileSync(rollbackPath, "utf8")) as HouseSettingPlanItem[];
    const r = await rollbackHouseSystemSetting({ db, manifest, live });
    r.actions.forEach((a) => console.log(`  ${live ? "DONE" : "WOULD"}: ${a}`));
    r.skipped.forEach((s) => console.log(`  SKIP: ${s}`));
    return;
  }

  const expectRaw = argValue("--expect");
  const expect = expectRaw && /^\d+$/.test(expectRaw) ? Number(expectRaw) : undefined;
  const result = await runHouseSystemSetting({ db, live, expect });
  for (const item of result.plan) {
    console.log(`  ${item.subAccountId}: save "${item.houseSystem}" (currently from ${item.from === "defaultDesign" ? "the default Astrology design" : "the built-in default"})`);
  }
  console.log(`\nWorkspaces to update: ${result.plan.length}`);
  if (!live) {
    console.log(`DRY RUN — zero writes. Authorized run: --live --expect ${result.plan.length} --manifest <out.json>`);
    return;
  }
  if (result.refused) {
    console.error(`REFUSED: ${result.refused}`);
    process.exitCode = 1;
    return;
  }
  const manifestPath = argValue("--manifest") ?? `house-system-setting-manifest-${Date.now()}.json`;
  writeFileSync(manifestPath, JSON.stringify(result.written, null, 2));
  console.log(`Saved ${result.written.length}. Rollback manifest: ${manifestPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
