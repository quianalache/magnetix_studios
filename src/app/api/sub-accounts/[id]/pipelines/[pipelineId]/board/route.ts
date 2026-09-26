import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { loadEffectiveTerritoryScope } from "@/lib/auth/territory-filter";
import { getPipeline } from "@/lib/server/pipelines-service";
import {
  buildBoardColumns,
  computeStats,
  matchPipelineDeals,
  parseDealFilters,
  parseRowExtras,
} from "@/lib/server/pipeline-deals-service";
import { readJsonObject, INVALID_JSON } from "@/lib/server/pipeline-route";
import type { BoardResponse } from "@/types/pipeline-board";

export const dynamic = "force-dynamic";

/**
 * POST { filters, offsets?, onlyStageId?, fresh? } — the Board for one
 * pipeline: exact per-stage counts + per-currency totals and one page of
 * cards per stage (`offsets[stageId]` + `onlyStageId` = "load more" for a
 * single column). Any active member; territory-scoped collaborators only
 * ever see their territories' deals.
 */
export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string; pipelineId: string }> },
) {
  const { id: subAccountId, pipelineId } = await ctx.params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;
  const body = await readJsonObject(request);
  if (!body) return INVALID_JSON();

  const pipeline = await getPipeline(subAccountId, pipelineId);
  if (!pipeline) {
    return NextResponse.json({ error: "Pipeline not found" }, { status: 404 });
  }
  const scope = await loadEffectiveTerritoryScope(access);
  const { deals, all, countries } = await matchPipelineDeals({
    subAccountId,
    territoryIds: scope.enforce ? (scope.ids ?? []) : null,
    pipelineId,
    filters: parseDealFilters(body.filters),
    fresh: body.fresh === true,
  });
  const offsets =
    body.offsets && typeof body.offsets === "object"
      ? (body.offsets as Record<string, number>)
      : undefined;
  const columns = await buildBoardColumns({
    pipeline,
    include: parseRowExtras(body.include),
    deals,
    offsets,
    onlyStageId: typeof body.onlyStageId === "string" ? body.onlyStageId : null,
  });
  const res: BoardResponse = {
    pipeline,
    stats: computeStats(deals),
    columns,
    countries,
    allStageCounts: computeStats(all).stageCounts,
  };
  return NextResponse.json(res);
}
