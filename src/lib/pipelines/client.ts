"use client";

import type { Pipeline } from "@/types/pipelines";
import type {
  BoardResponse,
  DealFilters,
  DealListResponse,
  DealSort,
  PipelineSummary,
} from "@/types/pipeline-board";

/**
 * Browser-side wrappers for the Multiple Pipelines APIs (2026-09-25). Every
 * call throws `PipelineApiError` carrying the server's message + code, so
 * callers can toast the real reason (e.g. "stage_has_deals").
 */

export class PipelineApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
  ) {
    super(message);
  }
}

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new PipelineApiError(
      typeof body.error === "string" ? body.error : "Something went wrong. Try again.",
      res.status,
      typeof body.code === "string" ? body.code : undefined,
    );
  }
  return body as T;
}

const base = (sa: string) => `/api/sub-accounts/${sa}/pipelines`;

export function fetchPipelineSummaries(
  sa: string,
  opts: { includeArchived?: boolean; fresh?: boolean } = {},
) {
  const q = new URLSearchParams({ stats: "1" });
  if (opts.includeArchived) q.set("includeArchived", "1");
  if (opts.fresh) q.set("fresh", "1");
  return call<{ pipelines: Pipeline[]; summaries: PipelineSummary[] }>(
    `${base(sa)}?${q.toString()}`,
  );
}

export function fetchPipelines(sa: string, includeArchived = false) {
  return call<{ pipelines: Pipeline[] }>(
    `${base(sa)}${includeArchived ? "?includeArchived=1" : ""}`,
  );
}

export function createPipelineApi(
  sa: string,
  input: { name: string; description: string; stageNames: string[] },
) {
  return call<{ pipeline: Pipeline }>(base(sa), {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updatePipelineApi(
  sa: string,
  pipelineId: string,
  patch: { name?: string; description?: string | null; status?: "active" | "archived" },
) {
  return call<{ pipeline: Pipeline }>(`${base(sa)}/${pipelineId}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export function reorderPipelinesApi(sa: string, orderedIds: string[]) {
  return call<{ ok: true }>(`${base(sa)}/order`, {
    method: "PUT",
    body: JSON.stringify({ orderedIds }),
  });
}

export function replaceStagesApi(
  sa: string,
  pipelineId: string,
  stages: { id?: string; name: string; archived: boolean }[],
) {
  return call<{ pipeline: Pipeline }>(`${base(sa)}/${pipelineId}/stages`, {
    method: "PUT",
    body: JSON.stringify({ stages }),
  });
}

export function reassignStageApi(
  sa: string,
  pipelineId: string,
  stageId: string,
  to: { toPipelineId?: string; toStageId: string },
) {
  return call<{ moved: number; remaining: number }>(
    `${base(sa)}/${pipelineId}/stages/${stageId}/reassign`,
    { method: "POST", body: JSON.stringify(to) },
  );
}

export function fetchBoard(
  sa: string,
  pipelineId: string,
  body: {
    filters: DealFilters;
    offsets?: Record<string, number>;
    onlyStageId?: string;
    fresh?: boolean;
  },
) {
  return call<BoardResponse>(`${base(sa)}/${pipelineId}/board`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function fetchDealList(
  sa: string,
  pipelineId: string,
  body: { filters: DealFilters; sort: DealSort; page: number; fresh?: boolean },
) {
  return call<DealListResponse>(`${base(sa)}/${pipelineId}/deals`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

/** PATCH /api/deals/:id — stage/pipeline moves + field edits. */
export function patchDealApi(dealId: string, patch: Record<string, unknown>) {
  return call<{ deal: unknown }>(`/api/deals/${dealId}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}
