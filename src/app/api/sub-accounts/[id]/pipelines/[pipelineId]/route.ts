import "server-only";

import { NextResponse } from "next/server";
import {
  requireSubAccountAdmin,
  requireSubAccountMember,
} from "@/lib/auth/require-tenancy";
import { getPipeline, updatePipeline } from "@/lib/server/pipelines-service";
import {
  INVALID_JSON,
  readJsonObject,
  withPipelineErrors,
} from "@/lib/server/pipeline-route";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string; pipelineId: string }> };

/**
 *   GET   — one pipeline (any member).
 *   PATCH { name?, description?, status?: "active" | "archived" } (admin).
 *         Archiving keeps every deal on the pipeline; it only stops new
 *         deals / moves into it until restored.
 */
export async function GET(request: Request, ctx: Ctx) {
  const { id: subAccountId, pipelineId } = await ctx.params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;
  const pipeline = await getPipeline(subAccountId, pipelineId);
  if (!pipeline) {
    return NextResponse.json({ error: "Pipeline not found" }, { status: 404 });
  }
  return NextResponse.json({ pipeline });
}

export async function PATCH(request: Request, ctx: Ctx) {
  const { id: subAccountId, pipelineId } = await ctx.params;
  const access = await requireSubAccountAdmin(request, subAccountId);
  if (access instanceof NextResponse) return access;
  const body = await readJsonObject(request);
  if (!body) return INVALID_JSON();
  return withPipelineErrors(async () => {
    const pipeline = await updatePipeline({
      subAccountId,
      pipelineId,
      uid: access.uid,
      name: body.name,
      description: body.description,
      status: body.status,
    });
    return NextResponse.json({ pipeline });
  });
}
