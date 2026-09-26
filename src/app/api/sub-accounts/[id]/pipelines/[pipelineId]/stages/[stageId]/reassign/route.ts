import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";
import { reassignStageDeals } from "@/lib/server/deals-service";
import {
  INVALID_JSON,
  readJsonObject,
  withPipelineErrors,
} from "@/lib/server/pipeline-route";

export const dynamic = "force-dynamic";

/**
 * POST { toPipelineId?, toStageId } — move every deal out of a stage so it
 * can be archived (admin). Moves at most REASSIGN_MAX_DEALS per call;
 * `remaining > 0` means call again.
 */
export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string; pipelineId: string; stageId: string }> },
) {
  const { id: subAccountId, pipelineId, stageId } = await ctx.params;
  const access = await requireSubAccountAdmin(request, subAccountId);
  if (access instanceof NextResponse) return access;
  const body = await readJsonObject(request);
  if (!body) return INVALID_JSON();
  const toStageId = typeof body.toStageId === "string" ? body.toStageId : "";
  if (!toStageId) {
    return NextResponse.json({ error: "toStageId is required" }, { status: 400 });
  }
  const toPipelineId =
    typeof body.toPipelineId === "string" && body.toPipelineId
      ? body.toPipelineId
      : pipelineId;
  return withPipelineErrors(async () =>
    NextResponse.json(
      await reassignStageDeals({
        subAccountId,
        pipelineId,
        stageId,
        toPipelineId,
        toStageId,
        userId: access.uid,
      }),
    ),
  );
}
