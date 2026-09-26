/**
 * Multiple Pipelines (2026-09-25) — default-pipeline migration core.
 *
 * Pure operational logic over an injected Firestore handle, shared by the
 * CLI (`scripts/pipelines-migrate.ts`) and the emulator checks
 * (`scripts/check-pipelines.ts`) so the tested code IS the code that runs.
 *
 * What "migrated" means for one sub-account:
 *   1. `subAccounts/{sa}/pipelines/default` exists, built from the legacy
 *      `subAccount.pipelineStages` label/order overrides (same stage ids,
 *      names and order the board showed before).
 *   2. Every deal of the sub-account carries `pipelineId`. Deals without
 *      one are stamped "default" — ONLY that field is written (no
 *      `updatedAt` bump, no stage change, no activity rows touched).
 *
 * Safety properties:
 *   - Tenant-safe: every query is `where("subAccountId","==",sa)`; nothing
 *     crosses sub-accounts.
 *   - Idempotent: the pipeline is created with `create()` (fails if it
 *     exists → skipped); deals are only stamped when the field is absent.
 *   - Auditable + recoverable: every write is recorded in a manifest
 *     (returned to the caller, written to disk by the CLI), and a summary
 *     doc is written to `pipelineMigrations/{runId}` (server-only).
 *     `rollback()` undoes exactly the manifest's writes when they are
 *     still in the state the migration left them.
 *   - The app never REQUIRES the migration: legacy deals without
 *     `pipelineId` already read as the default pipeline, and an unmigrated
 *     sub-account gets a virtual default pipeline.
 */
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import {
  DEFAULT_PIPELINE_ID,
  defaultStagesFromOverrides,
  dealPipelineId,
  type PipelineStageDef,
} from "../src/types/pipelines";
import type { PipelineStageOverride } from "../src/types/deals";

export interface ManifestEntry {
  kind: "pipeline_created" | "deal_stamped";
  subAccountId: string;
  path: string;
}

export interface SubAccountPlan {
  subAccountId: string;
  agencyId: string;
  defaultPipelineExists: boolean;
  defaultStages: PipelineStageDef[];
  totalDeals: number;
  dealsMissingPipelineId: number;
  /** Deals pointing at a pipeline doc that doesn't exist (not "default"). */
  dealsWithUnknownPipeline: string[];
  /** Deals whose stageId isn't a stage of their pipeline. */
  dealsWithUnknownStage: string[];
}

export interface RunResult {
  runId: string;
  mode: "dry-run" | "apply";
  plans: SubAccountPlan[];
  manifest: ManifestEntry[];
}

const BATCH = 400;

async function subAccountIds(db: Firestore, only?: string[]): Promise<string[]> {
  if (only && only.length > 0) return only;
  const snap = await db.collection("subAccounts").select().get();
  return snap.docs.map((d) => d.id);
}

async function planSubAccount(db: Firestore, sa: string): Promise<SubAccountPlan> {
  const subSnap = await db.doc(`subAccounts/${sa}`).get();
  if (!subSnap.exists) throw new Error(`Sub-account ${sa} not found`);
  const sub = subSnap.data() ?? {};
  const [pipelinesSnap, dealsSnap] = await Promise.all([
    db.collection(`subAccounts/${sa}/pipelines`).get(),
    db.collection("deals").where("subAccountId", "==", sa).get(),
  ]);
  const stored = new Map(
    pipelinesSnap.docs.map((d) => [
      d.id,
      ((d.data().stages ?? []) as PipelineStageDef[]).map((s) => s.id),
    ]),
  );
  const defaultStages = defaultStagesFromOverrides(
    sub.pipelineStages as PipelineStageOverride[] | undefined,
  );
  const stageIdsOf = (pid: string): string[] | null =>
    stored.get(pid) ??
    (pid === DEFAULT_PIPELINE_ID ? defaultStages.map((s) => s.id) : null);

  const plan: SubAccountPlan = {
    subAccountId: sa,
    agencyId: String(sub.agencyId ?? ""),
    defaultPipelineExists: stored.has(DEFAULT_PIPELINE_ID),
    defaultStages,
    totalDeals: dealsSnap.size,
    dealsMissingPipelineId: 0,
    dealsWithUnknownPipeline: [],
    dealsWithUnknownStage: [],
  };
  for (const d of dealsSnap.docs) {
    const data = d.data();
    if (!data.pipelineId) plan.dealsMissingPipelineId++;
    const pid = dealPipelineId(data);
    const ids = stageIdsOf(pid);
    if (!ids) plan.dealsWithUnknownPipeline.push(d.id);
    else if (!ids.includes(String(data.stageId ?? ""))) {
      plan.dealsWithUnknownStage.push(d.id);
    }
  }
  return plan;
}

export async function runMigration(
  db: Firestore,
  opts: { apply: boolean; subAccountIds?: string[]; runId: string },
): Promise<RunResult> {
  const result: RunResult = {
    runId: opts.runId,
    mode: opts.apply ? "apply" : "dry-run",
    plans: [],
    manifest: [],
  };
  for (const sa of await subAccountIds(db, opts.subAccountIds)) {
    const plan = await planSubAccount(db, sa);
    result.plans.push(plan);
    if (!opts.apply) continue;

    if (!plan.defaultPipelineExists) {
      const ref = db.doc(`subAccounts/${sa}/pipelines/${DEFAULT_PIPELINE_ID}`);
      try {
        await ref.create({
          subAccountId: sa,
          agencyId: plan.agencyId,
          name: "Sales Pipeline",
          description: null,
          status: "active",
          order: 0,
          stages: plan.defaultStages,
          createdByUid: null,
          updatedByUid: null,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
          archivedAt: null,
          materializedFrom: `migration:${opts.runId}`,
        });
        result.manifest.push({ kind: "pipeline_created", subAccountId: sa, path: ref.path });
      } catch (err) {
        // ALREADY_EXISTS (6): created concurrently (e.g. by the app) — fine.
        if ((err as { code?: number }).code !== 6) throw err;
      }
    }

    if (plan.dealsMissingPipelineId > 0) {
      const snap = await db.collection("deals").where("subAccountId", "==", sa).get();
      const todo = snap.docs.filter((d) => !d.data().pipelineId);
      for (let i = 0; i < todo.length; i += BATCH) {
        const batch = db.batch();
        for (const d of todo.slice(i, i + BATCH)) {
          // Precondition: only if unchanged since read, so a concurrent app
          // write (which stamps its own pipelineId) is never overwritten.
          batch.update(d.ref, { pipelineId: DEFAULT_PIPELINE_ID }, {
            lastUpdateTime: d.updateTime,
          });
          result.manifest.push({ kind: "deal_stamped", subAccountId: sa, path: d.ref.path });
        }
        await batch.commit();
      }
    }
  }

  if (opts.apply) {
    await db.doc(`pipelineMigrations/${opts.runId}`).set({
      runId: opts.runId,
      createdAt: FieldValue.serverTimestamp(),
      subAccounts: result.plans.map((p) => ({
        subAccountId: p.subAccountId,
        totalDeals: p.totalDeals,
        stamped: p.dealsMissingPipelineId,
        pipelineCreated: !p.defaultPipelineExists,
        unknownPipeline: p.dealsWithUnknownPipeline.length,
        unknownStage: p.dealsWithUnknownStage.length,
      })),
      manifestSize: result.manifest.length,
    });
  }
  return result;
}

export interface ReconcileRow {
  subAccountId: string;
  ok: boolean;
  totalDeals: number;
  dealsMissingPipelineId: number;
  defaultPipelineExists: boolean;
  /** Default pipeline stage names/order differ from the legacy overrides. */
  defaultStageDrift: boolean;
  dealsWithUnknownPipeline: string[];
  dealsWithUnknownStage: string[];
  dealsByPipeline: Record<string, number>;
}

/**
 * Post-migration reconciliation. `ok` = default pipeline stored, no deal
 * without `pipelineId`, no deal on an unknown pipeline or stage.
 * `defaultStageDrift` is informational: it's expected once an admin edits
 * the default pipeline's stages after migration.
 */
export async function reconcile(
  db: Firestore,
  opts: { subAccountIds?: string[] } = {},
): Promise<ReconcileRow[]> {
  const rows: ReconcileRow[] = [];
  for (const sa of await subAccountIds(db, opts.subAccountIds)) {
    const plan = await planSubAccount(db, sa);
    const dealsSnap = await db.collection("deals").where("subAccountId", "==", sa).get();
    const byPipeline: Record<string, number> = {};
    for (const d of dealsSnap.docs) {
      const pid = dealPipelineId(d.data());
      byPipeline[pid] = (byPipeline[pid] ?? 0) + 1;
    }
    const stored = await db.doc(`subAccounts/${sa}/pipelines/${DEFAULT_PIPELINE_ID}`).get();
    const storedSig = JSON.stringify(
      ((stored.data()?.stages ?? []) as PipelineStageDef[])
        .filter((s) => !s.archived)
        .map((s) => [s.id, s.name]),
    );
    const legacySig = JSON.stringify(plan.defaultStages.map((s) => [s.id, s.name]));
    rows.push({
      subAccountId: sa,
      ok:
        plan.defaultPipelineExists &&
        plan.dealsMissingPipelineId === 0 &&
        plan.dealsWithUnknownPipeline.length === 0 &&
        plan.dealsWithUnknownStage.length === 0,
      totalDeals: plan.totalDeals,
      dealsMissingPipelineId: plan.dealsMissingPipelineId,
      defaultPipelineExists: plan.defaultPipelineExists,
      defaultStageDrift: stored.exists && storedSig !== legacySig,
      dealsWithUnknownPipeline: plan.dealsWithUnknownPipeline,
      dealsWithUnknownStage: plan.dealsWithUnknownStage,
      dealsByPipeline: byPipeline,
    });
  }
  return rows;
}

/**
 * Undo a run's writes where they're still exactly as the migration left
 * them: un-stamp deals still on "default" (legacy semantics make that a
 * no-op for the app), and delete a created default pipeline only if it was
 * never edited since. Anything changed since is reported, never forced.
 */
export async function rollback(
  db: Firestore,
  manifest: ManifestEntry[],
  runId: string,
): Promise<{ reverted: string[]; skipped: { path: string; reason: string }[] }> {
  const reverted: string[] = [];
  const skipped: { path: string; reason: string }[] = [];
  for (const e of manifest) {
    const ref = db.doc(e.path);
    const snap = await ref.get();
    if (!snap.exists) {
      skipped.push({ path: e.path, reason: "no longer exists" });
      continue;
    }
    const data = snap.data()!;
    if (e.kind === "deal_stamped") {
      if (data.pipelineId !== DEFAULT_PIPELINE_ID) {
        skipped.push({ path: e.path, reason: `now on pipeline ${String(data.pipelineId)}` });
        continue;
      }
      await ref.update({ pipelineId: FieldValue.delete() }, { lastUpdateTime: snap.updateTime });
      reverted.push(e.path);
    } else {
      const created = data.createdAt?.toMillis?.();
      const updated = data.updatedAt?.toMillis?.();
      if (data.materializedFrom !== `migration:${runId}` || created !== updated) {
        skipped.push({ path: e.path, reason: "edited since migration" });
        continue;
      }
      const siblings = await ref.parent.get();
      if (siblings.size > 1) {
        skipped.push({ path: e.path, reason: "other pipelines exist" });
        continue;
      }
      await ref.delete({ lastUpdateTime: snap.updateTime });
      reverted.push(e.path);
    }
  }
  return { reverted, skipped };
}
