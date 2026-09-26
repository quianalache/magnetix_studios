import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";
import { replaceStages } from "@/lib/server/pipelines-service";
import {
  INVALID_JSON,
  readJsonObject,
  withPipelineErrors,
} from "@/lib/server/pipeline-route";

export const dynamic = "force-dynamic";

/**
 * PUT { stages: [{ id?, name, archived? }] } — Manage Stages (admin).
 * Full ordered replacement: existing stages by id, new stages without one.
 * See `replaceStages` for the invariants (no removal, Won/Lost fixed,
 * 409 `stage_has_deals` when archiving a stage that still holds deals).
 */
export async function PUT(
  request: Request,
  ctx: { params: Promise<{ id: string; pipelineId: string }> },
) {
  const { id: subAccountId, pipelineId } = await ctx.params;
  const access = await requireSubAccountAdmin(request, subAccountId);
  if (access instanceof NextResponse) return access;
  const body = await readJsonObject(request);
  if (!body) return INVALID_JSON();
  return withPipelineErrors(async () => {
    const pipeline = await replaceStages({
      subAccountId,
      pipelineId,
      uid: access.uid,
      stages: body.stages,
    });
    return NextResponse.json({ pipeline });
  });
}
