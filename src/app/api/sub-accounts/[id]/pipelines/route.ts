import "server-only";

import { NextResponse } from "next/server";
import {
  requireSubAccountAdmin,
  requireSubAccountMember,
} from "@/lib/auth/require-tenancy";
import { loadEffectiveTerritoryScope } from "@/lib/auth/territory-filter";
import { createPipeline, listPipelines } from "@/lib/server/pipelines-service";
import { summarizePipelines } from "@/lib/server/pipeline-deals-service";
import type { PipelineSummary } from "@/types/pipeline-board";
import {
  INVALID_JSON,
  readJsonObject,
  withPipelineErrors,
} from "@/lib/server/pipeline-route";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Multiple Pipelines (2026-09-25).
 *   GET  ?includeArchived=1&stats=1 — the sub-account's pipelines (any
 *        member). `stats=1` adds per-pipeline deal stats for the Overview,
 *        computed from the caller's territory-scoped deals.
 *   POST { name, description?, stageNames[] } — create (admin). Won + Lost
 *        are appended to `stageNames` automatically.
 */
export async function GET(request: Request, ctx: Ctx) {
  const { id: subAccountId } = await ctx.params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;
  const params = new URL(request.url).searchParams;
  const includeArchived = params.get("includeArchived") === "1";
  return withPipelineErrors(async () => {
    const pipelines = await listPipelines(subAccountId, { includeArchived });
    if (params.get("stats") !== "1") {
      return NextResponse.json({ pipelines });
    }
    const scope = await loadEffectiveTerritoryScope(access);
    const stats = await summarizePipelines({
      subAccountId,
      territoryIds: scope.enforce ? (scope.ids ?? []) : null,
      pipelines,
      fresh: params.get("fresh") === "1",
    });
    const summaries: PipelineSummary[] = pipelines.map((pipeline) => {
      const s = stats.get(pipeline.id)!;
      const docMs = pipeline.updatedAt ? Date.parse(pipeline.updatedAt) : 0;
      const last = Math.max(docMs, s.lastDealAt);
      return {
        pipeline,
        stats: s.stats,
        lastActivityAt: last > 0 ? new Date(last).toISOString() : null,
      };
    });
    return NextResponse.json({ pipelines, summaries });
  });
}

export async function POST(request: Request, ctx: Ctx) {
  const { id: subAccountId } = await ctx.params;
  const access = await requireSubAccountAdmin(request, subAccountId);
  if (access instanceof NextResponse) return access;
  const body = await readJsonObject(request);
  if (!body) return INVALID_JSON();
  return withPipelineErrors(async () => {
    const pipeline = await createPipeline({
      subAccountId,
      uid: access.uid,
      name: body.name,
      description: body.description,
      stageNames: body.stageNames,
    });
    return NextResponse.json({ pipeline }, { status: 201 });
  });
}
