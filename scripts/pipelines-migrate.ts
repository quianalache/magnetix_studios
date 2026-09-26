/**
 * Multiple Pipelines (2026-09-25) — default-pipeline migration CLI.
 * Logic lives in `pipelines-migration-core.ts` (see its header).
 *
 *   pnpm exec tsx scripts/pipelines-migrate.ts dry-run   [--sub-account <id>]...
 *   pnpm exec tsx scripts/pipelines-migrate.ts apply     [--sub-account <id>]...
 *   pnpm exec tsx scripts/pipelines-migrate.ts reconcile [--sub-account <id>]...
 *   pnpm exec tsx scripts/pipelines-migrate.ts rollback  --manifest <file>
 *
 * Every mode writes a JSON report to migration-artifacts/pipelines/.
 * `apply` also writes the manifest `rollback` consumes.
 *
 * PRODUCTION GUARD: `apply` and `rollback` refuse to run against a real
 * project unless BOTH `--allow-production` is passed AND the environment
 * variable PIPELINES_MIGRATION_CONFIRM equals the Firebase project id.
 * Against the emulator (FIRESTORE_EMULATOR_HOST set) no confirmation is
 * needed. `dry-run` and `reconcile` are read-only everywhere.
 * The owner must authorize any production run — see the Build Log.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { cert, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import {
  reconcile,
  rollback,
  runMigration,
  type ManifestEntry,
} from "./pipelines-migration-core";

const args = process.argv.slice(2);
const mode = args[0];
if (!["dry-run", "apply", "reconcile", "rollback"].includes(mode ?? "")) {
  console.error("Usage: pipelines-migrate.ts <dry-run|apply|reconcile|rollback> [--sub-account <id>]... [--manifest <file>] [--allow-production]");
  process.exit(2);
}
const flag = (name: string) => args.includes(name);
const values = (name: string) =>
  args.flatMap((a, i) => (a === name && args[i + 1] ? [args[i + 1]] : []));

const emulator = !!process.env.FIRESTORE_EMULATOR_HOST;
const projectId =
  process.env.GCLOUD_PROJECT ??
  process.env.FIREBASE_ADMIN_PROJECT_ID ??
  process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ??
  "";
if (!projectId) {
  console.error("No project id (GCLOUD_PROJECT / FIREBASE_ADMIN_PROJECT_ID).");
  process.exit(2);
}

const writes = mode === "apply" || mode === "rollback";
if (writes && !emulator) {
  if (!flag("--allow-production") || process.env.PIPELINES_MIGRATION_CONFIRM !== projectId) {
    console.error(
      `Refusing to ${mode} against project "${projectId}" without --allow-production and PIPELINES_MIGRATION_CONFIRM=${projectId}.`,
    );
    process.exit(2);
  }
}

if (emulator) {
  initializeApp({ projectId });
} else {
  const key = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!key || !process.env.FIREBASE_ADMIN_CLIENT_EMAIL) {
    console.error("Missing FIREBASE_ADMIN_CLIENT_EMAIL / FIREBASE_ADMIN_PRIVATE_KEY.");
    process.exit(2);
  }
  initializeApp({
    credential: cert({
      projectId,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: key,
    }),
  });
}
const db = getFirestore();

const outDir = join(process.cwd(), "migration-artifacts", "pipelines");
mkdirSync(outDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const write = (name: string, data: unknown) => {
  const file = join(outDir, `${stamp}-${name}.json`);
  writeFileSync(file, JSON.stringify(data, null, 2));
  return file;
};

async function main() {
  const subAccountIds = values("--sub-account");
  console.log(`[pipelines-migrate] ${mode} on ${projectId}${emulator ? " (emulator)" : ""}`);

  if (mode === "dry-run" || mode === "apply") {
    const runId = `pipelines-${stamp}`;
    const res = await runMigration(db, { apply: mode === "apply", subAccountIds, runId });
    const file = write(mode, res);
    const t = res.plans.reduce(
      (a, p) => ({
        subs: a.subs + 1,
        create: a.create + (p.defaultPipelineExists ? 0 : 1),
        stamp: a.stamp + p.dealsMissingPipelineId,
        unknownPipeline: a.unknownPipeline + p.dealsWithUnknownPipeline.length,
        unknownStage: a.unknownStage + p.dealsWithUnknownStage.length,
      }),
      { subs: 0, create: 0, stamp: 0, unknownPipeline: 0, unknownStage: 0 },
    );
    console.log(
      `${mode === "apply" ? "Applied" : "Would apply"}: ${t.subs} sub-accounts, ${t.create} default pipelines to create, ${t.stamp} deals to stamp. Anomalies (not modified): ${t.unknownPipeline} unknown-pipeline, ${t.unknownStage} unknown-stage deals.`,
    );
    if (mode === "apply") {
      const manifest = write("manifest", { runId, entries: res.manifest });
      console.log(`Manifest: ${manifest}`);
    }
    console.log(`Report: ${file}`);
  } else if (mode === "reconcile") {
    const rows = await reconcile(db, { subAccountIds });
    const bad = rows.filter((r) => !r.ok);
    console.log(`Reconcile: ${rows.length - bad.length}/${rows.length} sub-accounts OK.`);
    for (const r of bad) {
      console.log(
        `  ${r.subAccountId}: pipelineStored=${r.defaultPipelineExists} missingPipelineId=${r.dealsMissingPipelineId} unknownPipeline=${r.dealsWithUnknownPipeline.length} unknownStage=${r.dealsWithUnknownStage.length}`,
      );
    }
    console.log(`Report: ${write("reconcile", rows)}`);
    if (bad.length > 0) process.exitCode = 1;
  } else {
    const file = values("--manifest")[0];
    if (!file) {
      console.error("rollback needs --manifest <file>");
      process.exit(2);
    }
    const m = JSON.parse(readFileSync(file, "utf8")) as { runId: string; entries: ManifestEntry[] };
    const res = await rollback(db, m.entries, m.runId);
    console.log(`Rollback: ${res.reverted.length} reverted, ${res.skipped.length} skipped.`);
    console.log(`Report: ${write("rollback", res)}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
