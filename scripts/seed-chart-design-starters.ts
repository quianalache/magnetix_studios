/**
 * Ready-made Chart Designs — add Magnetix Violet, Monochrome, Warm Sunset
 * and Midnight to existing workspaces (see
 * scripts/lib/chart-design-starters-runner.ts and
 * src/lib/energetics/chart-design-starters.ts).
 *
 *   Dry run (default, reads only):
 *     pnpm exec tsx scripts/seed-chart-design-starters.ts --env-file <path/.env.local>
 *   Live (authorized runs only; totals must equal the dry run):
 *     pnpm exec tsx scripts/seed-chart-design-starters.ts --env-file <path> --live --expect sets=N,records=M --manifest <out.json>
 *   Rollback (dry run unless --live):
 *     pnpm exec tsx scripts/seed-chart-design-starters.ts --env-file <path> --rollback <manifest.json> [--live]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { argValue, parseTotals, scriptFirestore } from "./lib/script-firestore";
import type { ChartDesignSystem } from "../src/types/chart-design";
import { starterPresetValues } from "../src/lib/energetics/chart-design-starters";
import {
  rollbackStarterSeeding,
  runStarterSeeding,
  type StarterManifestEntry,
  type StarterTotals,
} from "./lib/chart-design-starters-runner";

async function main() {
  const live = process.argv.includes("--live");
  const { db, target } = scriptFirestore();
  console.log(`=== Ready-made Chart Designs — ${live ? "LIVE" : "DRY RUN"} — ${target} ===\n`);

  const rollbackPath = argValue("--rollback");
  if (rollbackPath) {
    const manifest = JSON.parse(readFileSync(rollbackPath, "utf8")) as StarterManifestEntry[];
    const r = await rollbackStarterSeeding({ db, manifest, live });
    r.actions.forEach((a) => console.log(`  ${live ? "DONE" : "WOULD"}: ${a}`));
    r.skipped.forEach((s) => console.log(`  SKIP: ${s}`));
    return;
  }

  const expect = parseTotals(argValue("--expect"), ["sets", "records"]) as StarterTotals | undefined;
  const only = argValue("--sub-account");
  const result = await runStarterSeeding({ db, live, expect, subAccountIds: only ? [only] : undefined });
  for (const plan of result.plans) {
    console.log(`Sub-account ${plan.subAccountId} — ${plan.status.toUpperCase()}`);
    plan.blockers.forEach((b) => console.log(`  BLOCKER: ${b}`));
    plan.skipped.forEach((s) => console.log(`  skip ${s.key}: ${s.reason}`));
    for (const c of plan.creates) {
      console.log(`  + unified design ${c.setId} "${c.name}"${c.renamedBecauseTaken ? ` (the name "${c.renamedBecauseTaken}" is already used by one of this workspace's designs — that design is left untouched)` : ""}`);
      for (const [system, m] of Object.entries(c.members)) {
        const preset = starterPresetValues(c.key, system as ChartDesignSystem);
        console.log(`      ${system.padEnd(11)} ${m.id}`);
        console.log(`                  all ${Object.keys(m.values).length} styling values copied from Default record ${m.copiedFrom}; ${Object.keys(preset).length} set by the preset: ${Object.entries(preset).map(([k, v]) => `${k}=${v}`).join(", ")}`);
      }
    }
    console.log("");
  }
  console.log(`Totals: sets=${result.totals.sets},records=${result.totals.records}`);
  if (!live) {
    console.log(`\nDRY RUN — zero writes. Authorized run: --live --expect sets=${result.totals.sets},records=${result.totals.records} --manifest <out.json>`);
    return;
  }
  if (result.refused) {
    console.error(`\nREFUSED: ${result.refused}`);
    process.exitCode = 1;
    return;
  }
  const manifestPath = argValue("--manifest") ?? `chart-design-starters-manifest-${Date.now()}.json`;
  writeFileSync(manifestPath, JSON.stringify(result.written, null, 2));
  console.log(`\nWrote ${result.written.length} workspace(s). Rollback manifest: ${manifestPath}`);
  for (const v of result.verification) console.log(`  verify ${v.subAccountId}: ${v.problems.length === 0 ? "OK" : v.problems.join("; ")}`);
  if (result.verification.some((v) => v.problems.length > 0)) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
