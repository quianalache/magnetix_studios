import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";
import { reorderPipelines } from "@/lib/server/pipelines-service";
import {
  INVALID_JSON,
  readJsonObject,
  withPipelineErrors,
} from "@/lib/server/pipeline-route";

export const dynamic = "force-dynamic";

/** PUT { orderedIds[] } — persist the Pipelines Overview order (admin). */
export async function PUT(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: subAccountId } = await ctx.params;
  const access = await requireSubAccountAdmin(request, subAccountId);
  if (access instanceof NextResponse) return access;
  const body = await readJsonObject(request);
  if (!body) return INVALID_JSON();
  return withPipelineErrors(async () => {
    await reorderPipelines({
      subAccountId,
      uid: access.uid,
      orderedIds: body.orderedIds,
    });
    return NextResponse.json({ ok: true });
  });
}
