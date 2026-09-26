import "server-only";

import { randomBytes } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import {
  DEFAULT_PIPELINE_ID,
  MAX_PIPELINES_PER_SUB_ACCOUNT,
  MAX_STAGES_PER_PIPELINE,
  PIPELINE_DESCRIPTION_MAX,
  PIPELINE_NAME_MAX,
  STAGE_NAME_MAX,
  dealPipelineId,
  defaultStagesFromOverrides,
  findStage,
  type Pipeline,
  type PipelineStageDef,
  type PipelineStatus,
} from "@/types/pipelines";
import {
  PIPELINE_STAGES,
  type CanonicalStageId,
  type PipelineStageOverride,
} from "@/types/deals";

/**
 * Multiple Pipelines (2026-09-25) — the single server chokepoint for
 * pipeline + stage configuration. Every write validates ownership against
 * the sub-account in the path; pipeline docs live UNDER the sub-account so
 * a foreign pipeline id simply doesn't resolve.
 *
 * Backward compatibility: a sub-account with no stored default pipeline
 * (not yet migrated) gets a VIRTUAL default synthesized from the legacy
 * `subAccount.pipelineStages` label/order overrides — the exact stages the
 * board showed before this feature. The first config write materializes it.
 * Legacy deals with no `pipelineId` belong to the default pipeline.
 */

export class PipelineError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
  ) {
    super(message);
    this.name = "PipelineError";
  }
}

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

function pipelinesCol(subAccountId: string) {
  return getAdminDb().collection(`subAccounts/${subAccountId}/pipelines`);
}

function iso(v: unknown): string | null {
  if (!v) return null;
  const t = v as { toDate?: () => Date };
  if (typeof t.toDate === "function") return t.toDate().toISOString();
  if (v instanceof Date) return v.toISOString();
  return null;
}

function cleanStages(raw: unknown): PipelineStageDef[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((s): s is Record<string, unknown> => !!s && typeof s === "object")
    .map((s): PipelineStageDef => ({
      id: String(s.id ?? ""),
      name: String(s.name ?? ""),
      type:
        s.type === "won" || s.type === "lost" ? s.type : ("open" as const),
      archived: s.archived === true,
    }))
    .filter((s) => s.id);
}

function serialize(
  id: string,
  data: FirebaseFirestore.DocumentData,
): Pipeline {
  return {
    id,
    subAccountId: String(data.subAccountId ?? ""),
    agencyId: String(data.agencyId ?? ""),
    name: String(data.name ?? ""),
    description:
      typeof data.description === "string" && data.description
        ? data.description
        : null,
    status: data.status === "archived" ? "archived" : "active",
    order: typeof data.order === "number" ? data.order : 0,
    stages: cleanStages(data.stages),
    createdByUid: (data.createdByUid as string | undefined) ?? null,
    updatedByUid: (data.updatedByUid as string | undefined) ?? null,
    createdAt: iso(data.createdAt),
    updatedAt: iso(data.updatedAt),
    archivedAt: iso(data.archivedAt),
  };
}

async function loadSubAccount(subAccountId: string) {
  const snap = await getAdminDb().doc(`subAccounts/${subAccountId}`).get();
  if (!snap.exists) throw new PipelineError("Sub-account not found", 404);
  return snap.data() ?? {};
}

/** The fields of the default pipeline as the legacy config describes it. */
export function legacyDefaultPipelineFields(
  subAccountId: string,
  sub: FirebaseFirestore.DocumentData,
) {
  return {
    subAccountId,
    agencyId: String(sub.agencyId ?? ""),
    name: "Sales Pipeline",
    description: null,
    status: "active" as PipelineStatus,
    order: 0,
    stages: defaultStagesFromOverrides(
      sub.pipelineStages as PipelineStageOverride[] | undefined,
    ),
  };
}

function virtualDefault(
  subAccountId: string,
  sub: FirebaseFirestore.DocumentData,
): Pipeline {
  return {
    id: DEFAULT_PIPELINE_ID,
    ...legacyDefaultPipelineFields(subAccountId, sub),
    createdByUid: null,
    updatedByUid: null,
    createdAt: null,
    updatedAt: null,
    archivedAt: null,
    virtual: true,
  };
}

function sortPipelines(list: Pipeline[]): Pipeline[] {
  return list.sort(
    (a, b) =>
      a.order - b.order ||
      a.name.localeCompare(b.name) ||
      a.id.localeCompare(b.id),
  );
}

/** Every pipeline of the sub-account (virtual default included when unmigrated). */
export async function listPipelines(
  subAccountId: string,
  opts: { includeArchived?: boolean } = {},
): Promise<Pipeline[]> {
  const [sub, snap] = await Promise.all([
    loadSubAccount(subAccountId),
    pipelinesCol(subAccountId).get(),
  ]);
  const list = snap.docs.map((d) => serialize(d.id, d.data()));
  if (!list.some((p) => p.id === DEFAULT_PIPELINE_ID)) {
    list.push(virtualDefault(subAccountId, sub));
  }
  const filtered = opts.includeArchived
    ? list
    : list.filter((p) => p.status === "active");
  return sortPipelines(filtered);
}

/** One pipeline, or null when it doesn't exist in THIS sub-account. */
export async function getPipeline(
  subAccountId: string,
  pipelineId: string,
): Promise<Pipeline | null> {
  if (!ID_RE.test(pipelineId)) return null;
  const snap = await pipelinesCol(subAccountId).doc(pipelineId).get();
  if (snap.exists) return serialize(snap.id, snap.data()!);
  if (pipelineId !== DEFAULT_PIPELINE_ID) return null;
  return virtualDefault(subAccountId, await loadSubAccount(subAccountId));
}

/**
 * Resolve + validate the (pipeline, stage) a deal is being written into.
 * The pipeline must exist in the sub-account and be active; the stage must
 * exist in THAT pipeline and not be archived. Used by the deal write
 * service so every entry point (dashboard, API, workflows, AI) is checked.
 */
export async function resolveWritableStage(opts: {
  subAccountId: string;
  pipelineId: string;
  stageId: string;
  /** Allow an archived stage when it's the deal's CURRENT stage (no move). */
  allowArchivedStageId?: string | null;
}): Promise<{ pipeline: Pipeline; stage: PipelineStageDef }> {
  const pipeline = await getPipeline(opts.subAccountId, opts.pipelineId);
  if (!pipeline) {
    throw new PipelineError("Pipeline not found", 404, "pipeline_not_found");
  }
  if (pipeline.status !== "active") {
    throw new PipelineError(
      "This pipeline is archived. Restore it before adding or moving deals.",
      409,
      "pipeline_archived",
    );
  }
  const stage = findStage(pipeline, opts.stageId);
  if (!stage) {
    throw new PipelineError(
      "That stage doesn't belong to this pipeline.",
      400,
      "stage_not_in_pipeline",
    );
  }
  if (stage.archived && stage.id !== opts.allowArchivedStageId) {
    throw new PipelineError(
      "That stage is archived. Restore it or pick another stage.",
      409,
      "stage_archived",
    );
  }
  return { pipeline, stage };
}

/** Stage label for activity text; falls back to the id for unknown stages. */
export function stageLabel(pipeline: Pipeline | null, stageId: string): string {
  const s = pipeline ? findStage(pipeline, stageId) : null;
  return s?.name ?? PIPELINE_STAGES.find((c) => c.id === stageId)?.label ?? stageId;
}

/**
 * Write the stored default pipeline if it doesn't exist yet (idempotent,
 * transactional). Returns the stored pipeline either way.
 */
export async function materializeDefaultPipeline(
  subAccountId: string,
  uid: string | null,
): Promise<Pipeline> {
  const db = getAdminDb();
  const ref = pipelinesCol(subAccountId).doc(DEFAULT_PIPELINE_ID);
  await db.runTransaction(async (tx) => {
    const existing = await tx.get(ref);
    if (existing.exists) return;
    const sub = await tx.get(db.doc(`subAccounts/${subAccountId}`));
    if (!sub.exists) throw new PipelineError("Sub-account not found", 404);
    tx.set(ref, {
      ...legacyDefaultPipelineFields(subAccountId, sub.data()!),
      createdByUid: uid,
      updatedByUid: uid,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      archivedAt: null,
      materializedFrom: "legacy-pipelineStages",
    });
  });
  const snap = await ref.get();
  return serialize(snap.id, snap.data()!);
}

function cleanName(v: unknown, max: number, what: string): string {
  const s = typeof v === "string" ? v.trim().replace(/\s+/g, " ") : "";
  if (s.length < 1 || s.length > max) {
    throw new PipelineError(`${what} must be 1–${max} characters.`, 400);
  }
  return s;
}

function cleanDescription(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v !== "string") {
    throw new PipelineError("Description must be text.", 400);
  }
  const s = v.trim();
  if (s.length > PIPELINE_DESCRIPTION_MAX) {
    throw new PipelineError(
      `Keep the description under ${PIPELINE_DESCRIPTION_MAX} characters.`,
      400,
    );
  }
  return s || null;
}

function mintStageId(taken: Set<string>): string {
  for (;;) {
    const id = `stg_${randomBytes(5).toString("hex")}`;
    if (!taken.has(id)) return id;
  }
}

/**
 * Create a pipeline. `stageNames` are the OPEN stages in order (1+);
 * Won and Lost are always appended as the standard outcomes.
 */
export async function createPipeline(opts: {
  subAccountId: string;
  uid: string;
  name: unknown;
  description?: unknown;
  stageNames: unknown;
}): Promise<Pipeline> {
  const name = cleanName(opts.name, PIPELINE_NAME_MAX, "Pipeline name");
  const description = cleanDescription(opts.description);
  if (!Array.isArray(opts.stageNames) || opts.stageNames.length < 1) {
    throw new PipelineError("Add at least one stage.", 400);
  }
  if (opts.stageNames.length + 2 > MAX_STAGES_PER_PIPELINE) {
    throw new PipelineError(
      `A pipeline can have at most ${MAX_STAGES_PER_PIPELINE - 2} stages plus Won and Lost.`,
      400,
    );
  }
  const taken = new Set<string>(["won", "lost"]);
  const stages: PipelineStageDef[] = opts.stageNames.map((n) => {
    const id = mintStageId(taken);
    taken.add(id);
    return {
      id,
      name: cleanName(n, STAGE_NAME_MAX, "Stage name"),
      type: "open",
      archived: false,
    };
  });
  stages.push(
    { id: "won", name: "Won", type: "won", archived: false },
    { id: "lost", name: "Lost", type: "lost", archived: false },
  );

  const sub = await loadSubAccount(opts.subAccountId);
  // The default pipeline must exist as a real doc before siblings do, so
  // ordering + "is the sub-account migrated" reads stay unambiguous.
  await materializeDefaultPipeline(opts.subAccountId, opts.uid);
  const existing = await pipelinesCol(opts.subAccountId).get();
  if (existing.size >= MAX_PIPELINES_PER_SUB_ACCOUNT) {
    throw new PipelineError(
      `A workspace can have at most ${MAX_PIPELINES_PER_SUB_ACCOUNT} pipelines. Archive-and-reuse or contact support.`,
      409,
    );
  }
  const maxOrder = existing.docs.reduce(
    (m, d) => Math.max(m, Number(d.data().order ?? 0)),
    0,
  );
  const ref = pipelinesCol(opts.subAccountId).doc();
  await ref.set({
    subAccountId: opts.subAccountId,
    agencyId: String(sub.agencyId ?? ""),
    name,
    description,
    status: "active",
    order: maxOrder + 1,
    stages,
    createdByUid: opts.uid,
    updatedByUid: opts.uid,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    archivedAt: null,
  });
  const snap = await ref.get();
  return serialize(snap.id, snap.data()!);
}

async function requireStored(
  subAccountId: string,
  pipelineId: string,
  uid: string,
): Promise<FirebaseFirestore.DocumentReference> {
  if (!ID_RE.test(pipelineId)) {
    throw new PipelineError("Pipeline not found", 404);
  }
  if (pipelineId === DEFAULT_PIPELINE_ID) {
    await materializeDefaultPipeline(subAccountId, uid);
  }
  const ref = pipelinesCol(subAccountId).doc(pipelineId);
  const snap = await ref.get();
  if (!snap.exists) throw new PipelineError("Pipeline not found", 404);
  return ref;
}

/** Rename / re-describe / archive / restore. */
export async function updatePipeline(opts: {
  subAccountId: string;
  pipelineId: string;
  uid: string;
  name?: unknown;
  description?: unknown;
  status?: unknown;
}): Promise<Pipeline> {
  const ref = await requireStored(opts.subAccountId, opts.pipelineId, opts.uid);
  const write: Record<string, unknown> = {
    updatedAt: FieldValue.serverTimestamp(),
    updatedByUid: opts.uid,
  };
  if (opts.name !== undefined) {
    write.name = cleanName(opts.name, PIPELINE_NAME_MAX, "Pipeline name");
  }
  if (opts.description !== undefined) {
    write.description = cleanDescription(opts.description);
  }
  if (opts.status !== undefined) {
    if (opts.status !== "active" && opts.status !== "archived") {
      throw new PipelineError("Status must be active or archived.", 400);
    }
    if (opts.status === "archived") {
      const active = (await listPipelines(opts.subAccountId)).filter(
        (p) => p.id !== opts.pipelineId,
      );
      if (active.length === 0) {
        throw new PipelineError(
          "Keep at least one active pipeline.",
          409,
          "last_active_pipeline",
        );
      }
      write.archivedAt = FieldValue.serverTimestamp();
    } else {
      write.archivedAt = null;
    }
    // Archiving never touches deals: they stay on the pipeline, readable
    // from its board and in reports; moves into it are refused while
    // archived (`resolveWritableStage`).
    write.status = opts.status;
  }
  await ref.update(write);
  const snap = await ref.get();
  return serialize(snap.id, snap.data()!);
}

/** Persist the Overview order. `orderedIds` must be pipelines of this sub-account. */
export async function reorderPipelines(opts: {
  subAccountId: string;
  uid: string;
  orderedIds: unknown;
}): Promise<void> {
  if (
    !Array.isArray(opts.orderedIds) ||
    opts.orderedIds.some((v) => typeof v !== "string")
  ) {
    throw new PipelineError("orderedIds must be a list of pipeline ids.", 400);
  }
  const ids = opts.orderedIds as string[];
  if (new Set(ids).size !== ids.length) {
    throw new PipelineError("Duplicate pipeline id.", 400);
  }
  if (ids.includes(DEFAULT_PIPELINE_ID)) {
    await materializeDefaultPipeline(opts.subAccountId, opts.uid);
  }
  const snap = await pipelinesCol(opts.subAccountId).get();
  const known = new Set(snap.docs.map((d) => d.id));
  for (const id of ids) {
    if (!known.has(id)) throw new PipelineError("Pipeline not found", 404);
  }
  const batch = getAdminDb().batch();
  ids.forEach((id, i) =>
    batch.update(pipelinesCol(opts.subAccountId).doc(id), {
      order: i,
      updatedAt: FieldValue.serverTimestamp(),
      updatedByUid: opts.uid,
    }),
  );
  await batch.commit();
}

/**
 * Deals currently in a stage of a pipeline. Queried by `stageId` (always
 * present) and narrowed in memory by pipeline so legacy docs without
 * `pipelineId` count for the default pipeline — no composite index needed.
 */
export async function dealsInStage(opts: {
  subAccountId: string;
  pipelineId: string;
  stageId: string;
}): Promise<FirebaseFirestore.QueryDocumentSnapshot[]> {
  const snap = await getAdminDb()
    .collection("deals")
    .where("subAccountId", "==", opts.subAccountId)
    .where("stageId", "==", opts.stageId)
    .get();
  return snap.docs.filter(
    (d) => dealPipelineId(d.data()) === opts.pipelineId,
  );
}

/**
 * Manage Stages — full replacement of a pipeline's stage list.
 *
 * `stages` is the desired ordered list: existing stages by `id` (rename,
 * reorder, archive/restore) and new stages WITHOUT an id (minted here).
 * Rules enforced:
 *   - Every existing stage must still be present (stages are archived,
 *     never removed — history + automations keep resolving).
 *   - Won and Lost stay present, unarchived, and keep their type.
 *   - At least one active open stage.
 *   - A stage that holds deals can't be archived: the caller must first
 *     reassign them (`reassignStageDeals`). Answers 409 `stage_has_deals`
 *     with the count so the UI can offer the reassignment.
 */
export async function replaceStages(opts: {
  subAccountId: string;
  pipelineId: string;
  uid: string;
  stages: unknown;
}): Promise<Pipeline> {
  if (!Array.isArray(opts.stages)) {
    throw new PipelineError("`stages` must be a list.", 400);
  }
  const ref = await requireStored(opts.subAccountId, opts.pipelineId, opts.uid);
  const current = serialize(ref.id, (await ref.get()).data()!);
  const byId = new Map(current.stages.map((s) => [s.id, s]));
  const taken = new Set(current.stages.map((s) => s.id));
  const seen = new Set<string>();
  const next: PipelineStageDef[] = [];

  for (const raw of opts.stages) {
    if (!raw || typeof raw !== "object") {
      throw new PipelineError("Each stage must be an object.", 400);
    }
    const r = raw as Record<string, unknown>;
    const name = cleanName(r.name, STAGE_NAME_MAX, "Stage name");
    const archived = r.archived === true;
    if (typeof r.id === "string" && r.id) {
      const prev = byId.get(r.id);
      if (!prev) {
        throw new PipelineError(`Unknown stage "${r.id}".`, 400);
      }
      if (seen.has(r.id)) {
        throw new PipelineError(`Duplicate stage "${r.id}".`, 400);
      }
      seen.add(r.id);
      if (prev.type !== "open" && archived) {
        throw new PipelineError(
          "Won and Lost are standard outcomes and can't be archived.",
          400,
        );
      }
      next.push({ id: prev.id, name, type: prev.type, archived });
    } else {
      const id = mintStageId(taken);
      taken.add(id);
      seen.add(id);
      next.push({ id, name, type: "open", archived });
    }
  }

  const missing = current.stages.filter((s) => !seen.has(s.id));
  if (missing.length > 0) {
    throw new PipelineError(
      "Stages can't be removed — archive them instead.",
      400,
      "stage_removed",
    );
  }
  if (next.length > MAX_STAGES_PER_PIPELINE) {
    throw new PipelineError(
      `A pipeline can have at most ${MAX_STAGES_PER_PIPELINE} stages (including archived).`,
      400,
    );
  }
  if (!next.some((s) => s.type === "open" && !s.archived)) {
    throw new PipelineError("Keep at least one active stage.", 400);
  }

  const newlyArchived = next.filter(
    (s) => s.archived && byId.get(s.id)?.archived === false,
  );
  for (const s of newlyArchived) {
    const deals = await dealsInStage({
      subAccountId: opts.subAccountId,
      pipelineId: opts.pipelineId,
      stageId: s.id,
    });
    if (deals.length > 0) {
      throw new PipelineError(
        `"${byId.get(s.id)!.name}" still has ${deals.length} deal${deals.length === 1 ? "" : "s"}. Move them to another stage before archiving it.`,
        409,
        "stage_has_deals",
      );
    }
  }

  await ref.update({
    stages: next,
    updatedAt: FieldValue.serverTimestamp(),
    updatedByUid: opts.uid,
  });

  if (opts.pipelineId === DEFAULT_PIPELINE_ID) {
    await mirrorDefaultToLegacyOverrides(opts.subAccountId, next);
  }
  const snap = await ref.get();
  return serialize(snap.id, snap.data()!);
}

/**
 * Keep the legacy `subAccount.pipelineStages` label/order overrides in step
 * with the default pipeline's canonical stages, so any consumer still on
 * `usePipelineStages()` shows the same names.
 */
async function mirrorDefaultToLegacyOverrides(
  subAccountId: string,
  stages: PipelineStageDef[],
): Promise<void> {
  const canonical = new Set<string>(PIPELINE_STAGES.map((s) => s.id));
  const overrides: PipelineStageOverride[] = stages
    .map((s, i) => ({ s, i }))
    .filter(({ s }) => canonical.has(s.id))
    .map(({ s, i }) => ({ id: s.id as CanonicalStageId, label: s.name, order: i }));
  await getAdminDb().doc(`subAccounts/${subAccountId}`).update({
    pipelineStages: overrides,
    updatedAt: FieldValue.serverTimestamp(),
  });
}

/**
 * The legacy Settings stage editor (label/order of the six canonical
 * stages) keeps working: when a stored default pipeline exists, apply the
 * same labels/order to it. Non-canonical stages keep their relative spot
 * after the canonical ones they followed.
 */
export async function applyLegacyOverridesToDefault(
  subAccountId: string,
  overrides: PipelineStageOverride[] | null,
): Promise<void> {
  const ref = pipelinesCol(subAccountId).doc(DEFAULT_PIPELINE_ID);
  const snap = await ref.get();
  if (!snap.exists) return; // virtual default already reads the overrides
  const current = serialize(snap.id, snap.data()!);
  const desired = defaultStagesFromOverrides(overrides);
  const desiredIdx = new Map(desired.map((s, i) => [s.id, i]));
  const nameOf = new Map(desired.map((s) => [s.id, s.name]));
  let lastCanonical = -1;
  const keyed = current.stages.map((s, i) => {
    const di = desiredIdx.get(s.id);
    if (di !== undefined) lastCanonical = di;
    return {
      stage: di !== undefined ? { ...s, name: nameOf.get(s.id)! } : s,
      key: di !== undefined ? di : lastCanonical + 0.001 * (i + 1),
    };
  });
  keyed.sort((a, b) => a.key - b.key);
  await ref.update({
    stages: keyed.map((k) => k.stage),
    updatedAt: FieldValue.serverTimestamp(),
  });
}
