import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { loadEffectiveTerritoryScope } from "@/lib/auth/territory-filter";
import { getPipeline } from "@/lib/server/pipelines-service";
import {
  buildListPage,
  computeStats,
  matchPipelineDeals,
  normalizeDealSort,
  parseDealFilters,
  parseRowExtras,
} from "@/lib/server/pipeline-deals-service";
import { readJsonObject, INVALID_JSON } from "@/lib/server/pipeline-route";
import type { DealListResponse } from "@/types/pipeline-board";

export const dynamic = "force-dynamic";

/**
 * POST { filters, sort, page, fresh? } — the List view for one pipeline.
 * Same filter model and the same underlying query as the Board, so the two
 * views can never disagree about which deals match.
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
  const page = await buildListPage({
    pipeline,
    include: parseRowExtras(body.include),
    deals,
    sort: normalizeDealSort(body.sort),
    page: typeof body.page === "number" ? body.page : 1,
  });
  const res: DealListResponse = {
    pipeline,
    stats: computeStats(deals),
    countries,
    allStageCounts: computeStats(all).stageCounts,
    ...page,
  };
  return NextResponse.json(res);
}
