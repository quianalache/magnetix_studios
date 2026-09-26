"use client";

import { useEffect, useState } from "react";
import { useSubAccount } from "@/context/sub-account-context";
import { fetchPipelines } from "@/lib/pipelines/client";
import { activeStages, DEFAULT_PIPELINE_ID, type Pipeline } from "@/types/pipelines";

/**
 * Pipeline + stage selector for workflow triggers and deal actions
 * (Multiple Pipelines, 2026-09-25). Only stages of the chosen pipeline can
 * be picked, by stable id — never a free-typed label. An unset pipeline is
 * the default pipeline (how workflows saved before pipelines behave).
 */
export function PipelineStagePicker({
  pipelineId,
  stageId,
  onChange,
  anyStageLabel,
  stagePrefix = "",
}: {
  pipelineId: string | null | undefined;
  stageId: string | null | undefined;
  onChange: (next: { pipelineId: string; stageId: string | null }) => void;
  /** Offer an empty "any stage" option with this label; omit to require a stage. */
  anyStageLabel?: string;
  stagePrefix?: string;
}) {
  const { subAccountId } = useSubAccount();
  const [pipelines, setPipelines] = useState<Pipeline[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetchPipelines(subAccountId, true)
      .then((r) => !cancelled && setPipelines(r.pipelines))
      .catch(() => !cancelled && setPipelines([]));
    return () => {
      cancelled = true;
    };
  }, [subAccountId]);

  const pid = pipelineId || DEFAULT_PIPELINE_ID;
  const pipeline = pipelines?.find((p) => p.id === pid);
  const stages = pipeline ? activeStages(pipeline) : [];
  const cls = "border-input bg-background h-9 w-full rounded-md border px-2 text-sm";

  return (
    <div className="mt-2 grid gap-2">
      <select
        aria-label="Pipeline"
        className={cls}
        value={pid}
        disabled={!pipelines}
        onChange={(e) => onChange({ pipelineId: e.target.value, stageId: null })}
      >
        {!pipeline && <option value={pid}>{pipelines ? "Unknown pipeline" : "Loading…"}</option>}
        {(pipelines ?? []).map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
            {p.status === "archived" ? " (archived)" : ""}
          </option>
        ))}
      </select>
      <select
        aria-label="Stage"
        className={cls}
        value={stageId ?? ""}
        disabled={!pipeline}
        onChange={(e) => onChange({ pipelineId: pid, stageId: e.target.value || null })}
      >
        {anyStageLabel !== undefined ? (
          <option value="">{anyStageLabel}</option>
        ) : (
          !stageId && <option value="">Choose a stage…</option>
        )}
        {stageId && pipeline && !stages.some((s) => s.id === stageId) && (
          <option value={stageId}>Unknown or archived stage</option>
        )}
        {stages.map((s) => (
          <option key={s.id} value={s.id}>
            {stagePrefix}
            {s.name}
          </option>
        ))}
      </select>
    </div>
  );
}
