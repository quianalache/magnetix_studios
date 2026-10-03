/**
 * Unified Chart Designs — one-time grouping of existing chart design
 * records into unified designs (2026-10). See
 * src/lib/energetics/chart-design-set-migration.ts for the grouping rules
 * and scripts/lib/chart-design-set-migration-runner.ts for the safety model.
 *
 *   Dry run (default — reads only, prints the plan):
 *     pnpm exec tsx scripts/migrate-chart-design-sets.ts --env-file <path/.env.local>
 *
 *   Live (REAL WRITES — only with explicit owner authorization). The totals
 *   must equal the dry run's exactly or nothing is written:
 *     pnpm exec tsx scripts/migrate-chart-design-sets.ts --env-file <path> --live \
 *       --expect sets=N,copies=N,stamps=N,profiles=N --manifest <out.json>
 *
 *   Rollback a live run (dry run unless --live):
 *     pnpm exec tsx scripts/migrate-chart-design-sets.ts --env-file <path> --rollback <manifest.json> [--live]
 *
 * Optional: --sub-account <id> to limit to one sub-account.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { argValue, parseTotals, scriptFirestore } from "./lib/script-firestore";
import {
  rollbackChartDesignSetMigration,
  runChartDesignSetMigration,
  type MigrationTotals,
  type RollbackManifestEntry,
} from "./lib/chart-design-set-migration-runner";

async function main() {
  const live = process.argv.includes("--live");
  const { db, target } = scriptFirestore();
  console.log(`=== Unified Chart Designs migration — ${live ? "LIVE" : "DRY RUN"} — ${target} ===\n`);

  const rollbackPath = argValue("--rollback");
  if (rollbackPath) {
    const manifest = JSON.parse(readFileSync(rollbackPath, "utf8")) as RollbackManifestEntry[];
    const r = await rollbackChartDesignSetMigration({ db, manifest, live });
    r.actions.forEach((a) => console.log(`  ${live ? "DONE" : "WOULD"}: ${a}`));
    r.skipped.forEach((s) => console.log(`  SKIP: ${s}`));
    console.log(live ? "\nRollback complete." : "\nRollback dry run — zero writes.");
    return;
  }

  const only = argValue("--sub-account");
  const expect = parseTotals(argValue("--expect"), ["sets", "copies", "stamps", "profiles"]) as MigrationTotals | undefined;
  const result = await runChartDesignSetMigration({ db, live, expect, subAccountIds: only ? [only] : undefined });

  for (const plan of result.plans) {
    console.log(`Sub-account ${plan.subAccountId} — ${plan.status.toUpperCase()}`);
    plan.blockers.forEach((b) => console.log(`  BLOCKER: ${b}`));
    plan.warnings.forEach((w) => console.log(`  warning: ${w}`));
    for (const set of plan.sets) {
      console.log(`  + unified design ${set.id} "${set.name}"${set.isDefault ? " [DEFAULT]" : ""} (${set.migration.source})`);
      for (const [system, id] of Object.entries(set.members)) {
        const copy = plan.copies.find((c) => c.id === id);
        console.log(`      ${system.padEnd(11)} ${id}${copy ? `  ← new independent copy of ${copy.sourceDesignId}` : "  (existing record)"}`);
      }
    }
    plan.profileAssignments.forEach((a) => console.log(`  profile ${a.profileId} → ${a.setId}`));
    console.log("");
  }
  const t = result.totals;
  console.log(`Totals: sets=${t.sets},copies=${t.copies},stamps=${t.stamps},profiles=${t.profiles}`);

  if (!live) {
    console.log("\nDRY RUN — zero writes. To apply (authorized runs only):");
    console.log(`  --live --expect sets=${t.sets},copies=${t.copies},stamps=${t.stamps},profiles=${t.profiles} --manifest <out.json>`);
    return;
  }
  if (result.refused) {
    console.error(`\nREFUSED: ${result.refused}`);
    process.exitCode = 1;
    return;
  }
  const manifestPath = argValue("--manifest") ?? `chart-design-sets-manifest-${Date.now()}.json`;
  writeFileSync(manifestPath, JSON.stringify(result.written, null, 2));
  console.log(`\nWrote ${result.written.length} sub-account(s). Rollback manifest: ${manifestPath}`);
  for (const v of result.verification) {
    console.log(`  verify ${v.subAccountId}: ${v.problems.length === 0 ? "OK" : v.problems.join("; ")}`);
  }
  if (result.verification.some((v) => v.problems.length > 0)) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
