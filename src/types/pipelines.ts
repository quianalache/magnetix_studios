import {
  PIPELINE_STAGES,
  resolvePipelineStages,
  type PipelineStage,
  type PipelineStageOverride,
} from "./deals";

/**
 * Multiple Pipelines (2026-09-25). Client-safe model + pure helpers.
 *
 * Storage: `subAccounts/{subAccountId}/pipelines/{pipelineId}` — server-only
 * (default-deny rules), all access through `/api/sub-accounts/[id]/pipelines`.
 * Stages are an ordered array ON the pipeline doc (bounded count, so a
 * reorder/rename is one atomic write).
 *
 * Identity invariants — these are what keep every existing consumer working:
 *   - Stage ids are unique WITHIN a pipeline, never re-used, never renamed.
 *     Labels are free text; nothing may branch on a label.
 *   - Every pipeline has exactly one `won` and one `lost` stage, and their
 *     ids are literally "won" and "lost". The workflow engine, review
 *     requests, reports, quotes and the public API all compare
 *     `stageId === "won" | "lost"`; that stays correct for every pipeline.
 *   - The migrated default pipeline has id {@link DEFAULT_PIPELINE_ID} and
 *     keeps the six canonical stage ids, so no existing deal's `stageId`
 *     changes. A deal with no `pipelineId` (legacy doc) belongs to it.
 *   - Stages and pipelines are archived, never deleted.
 */

export const DEFAULT_PIPELINE_ID = "default";

export const PIPELINE_NAME_MAX = 60;
export const PIPELINE_DESCRIPTION_MAX = 280;
export const STAGE_NAME_MAX = 40;
/** Ceiling on stages per pipeline (active + archived) — keeps the doc small. */
export const MAX_STAGES_PER_PIPELINE = 30;
/** Ceiling on pipelines per sub-account (active + archived). */
export const MAX_PIPELINES_PER_SUB_ACCOUNT = 100;

export type PipelineStatus = "active" | "archived";
export type PipelineStageType = "open" | "won" | "lost";

export interface PipelineStageDef {
  /** Stable id, unique within the pipeline. "won"/"lost" for the terminals. */
  id: string;
  name: string;
  type: PipelineStageType;
  /** Archived stages keep their id so history/automations still resolve. */
  archived: boolean;
}

export interface Pipeline {
  id: string;
  subAccountId: string;
  agencyId: string;
  name: string;
  description: string | null;
  status: PipelineStatus;
  /** Display order on the Overview (ascending). */
  order: number;
  /** Ordered: array position IS the display order. */
  stages: PipelineStageDef[];
  createdByUid: string | null;
  updatedByUid: string | null;
  /** ISO strings on the wire (API responses). */
  createdAt: string | null;
  updatedAt: string | null;
  archivedAt: string | null;
  /**
   * True when this is the synthesized default pipeline of a sub-account
   * that hasn't been migrated yet (no stored doc). Read-only projection of
   * the legacy `subAccount.pipelineStages` overrides; the first edit
   * materializes it.
   */
  virtual?: boolean;
}

export function isTerminalStageId(id: string | null | undefined): id is "won" | "lost" {
  return id === "won" || id === "lost";
}

/** Legacy deals (no `pipelineId`) belong to the default pipeline. */
export function dealPipelineId(deal: { pipelineId?: string | null }): string {
  return typeof deal.pipelineId === "string" && deal.pipelineId
    ? deal.pipelineId
    : DEFAULT_PIPELINE_ID;
}

/**
 * The default pipeline's stages derived from the legacy per-sub-account
 * label/order overrides — the same resolution the board used before
 * multiple pipelines existed, so the migrated pipeline looks identical.
 */
export function defaultStagesFromOverrides(
  overrides?: PipelineStageOverride[] | null,
): PipelineStageDef[] {
  return resolvePipelineStages(overrides).map((s) => ({
    id: s.id,
    name: s.label,
    type: s.terminal ?? "open",
    archived: false,
  }));
}

/** Stages visible on the board (archived ones hidden), in display order. */
export function activeStages(pipeline: Pick<Pipeline, "stages">): PipelineStageDef[] {
  return pipeline.stages.filter((s) => !s.archived);
}

export function findStage(
  pipeline: Pick<Pipeline, "stages">,
  stageId: string | null | undefined,
): PipelineStageDef | null {
  return pipeline.stages.find((s) => s.id === stageId) ?? null;
}

const OPEN_TONES = [
  "bg-slate-500/10 text-slate-700 dark:text-slate-300",
  "bg-blue-500/10 text-blue-700 dark:text-blue-300",
  "bg-indigo-500/10 text-indigo-700 dark:text-indigo-300",
  "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  "bg-violet-500/10 text-violet-700 dark:text-violet-300",
  "bg-cyan-500/10 text-cyan-700 dark:text-cyan-300",
];

/**
 * Adapt a pipeline stage to the legacy {@link PipelineStage} display shape
 * the existing board / cards / move sheet consume. Canonical ids keep their
 * historical tone; custom open stages cycle a palette by position.
 */
export function toDisplayStages(stages: PipelineStageDef[]): PipelineStage[] {
  let openIdx = 0;
  return stages.map((s) => {
    const canonical = PIPELINE_STAGES.find((c) => c.id === s.id);
    const tone =
      canonical?.tone ??
      (s.type === "won"
        ? PIPELINE_STAGES[4].tone
        : s.type === "lost"
          ? PIPELINE_STAGES[5].tone
          : OPEN_TONES[openIdx++ % OPEN_TONES.length]);
    if (canonical && s.type === "open") openIdx++;
    return {
      id: s.id,
      label: s.name,
      tone,
      ...(s.type === "open" ? {} : { terminal: s.type }),
    };
  });
}
