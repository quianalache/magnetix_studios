"use client";

import { useEffect, useMemo, useState } from "react";
import { useOptionalSubAccount } from "@/context/sub-account-context";
import { fetchPipelines } from "@/lib/pipelines/client";
import { getStage, type PipelineStage } from "@/types/deals";
import {
  DEFAULT_PIPELINE_ID,
  dealPipelineId,
  toDisplayStages,
  type Pipeline,
} from "@/types/pipelines";

/**
 * Stage + pipeline labels for deals shown OUTSIDE the Pipelines pages
 * (contact profile, command palette, leads map…). Multiple Pipelines,
 * 2026-09-25: a deal's stage only has a name within its own pipeline, so
 * the canonical `getStage()` lookup is wrong for custom pipelines. One
 * pipelines fetch per sub-account per page load, shared across callers.
 */
const cache = new Map<string, Promise<Pipeline[]>>();

export function usePipelineLabels(subAccountIdOverride?: string | null): {
  stageFor: (deal: { pipelineId?: string | null; stageId: string }) => PipelineStage;
  pipelineNameFor: (deal: { pipelineId?: string | null }) => string | null;
  hasMultiplePipelines: boolean;
} {
  const sa = useOptionalSubAccount();
  const subAccountId = subAccountIdOverride ?? sa?.subAccountId ?? "";
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);

  useEffect(() => {
    if (!subAccountId) return;
    let p = cache.get(subAccountId);
    if (!p) {
      p = fetchPipelines(subAccountId, true)
        .then((r) => r.pipelines)
        .catch(() => {
          cache.delete(subAccountId);
          return [];
        });
      cache.set(subAccountId, p);
    }
    let cancelled = false;
    void p.then((list) => !cancelled && setPipelines(list));
    return () => {
      cancelled = true;
    };
  }, [subAccountId]);

  return useMemo(() => {
    const display = new Map(pipelines.map((p) => [p.id, toDisplayStages(p.stages)]));
    const names = new Map(pipelines.map((p) => [p.id, p.name]));
    return {
      stageFor: (deal) => {
        const pid = dealPipelineId(deal);
        const found = display.get(pid)?.find((s) => s.id === deal.stageId);
        if (found) return found;
        // Not loaded yet / unknown: canonical label for the default
        // pipeline's ids, otherwise the raw id — never a wrong stage name.
        if (pid === DEFAULT_PIPELINE_ID) return getStage(deal.stageId);
        return { id: deal.stageId, label: deal.stageId, tone: getStage("new").tone };
      },
      pipelineNameFor: (deal) => names.get(dealPipelineId(deal)) ?? null,
      hasMultiplePipelines: pipelines.filter((p) => p.status === "active").length > 1,
    };
  }, [pipelines]);
}
