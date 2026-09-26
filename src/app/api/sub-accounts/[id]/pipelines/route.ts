import "server-only";

import { NextResponse } from "next/server";
import {
  requireSubAccountAdmin,
  requireSubAccountMember,
} from "@/lib/auth/require-tenancy";
import { createPipeline, listPipelines } from "@/lib/server/pipelines-service";
import {
  INVALID_JSON,
  readJsonObject,
  withPipelineErrors,
} from "@/lib/server/pipeline-route";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Multiple Pipelines (2026-09-25).
 *   GET  ?includeArchived=1 — the sub-account's pipelines (any member).
 *   POST { name, description?, stageNames[] } — create (admin). Won + Lost
 *        are appended to `stageNames` automatically.
 */
export async function GET(request: Request, ctx: Ctx) {
  const { id: subAccountId } = await ctx.params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;
  const includeArchived =
    new URL(request.url).searchParams.get("includeArchived") === "1";
  return withPipelineErrors(async () =>
    NextResponse.json({
      pipelines: await listPipelines(subAccountId, { includeArchived }),
    }),
  );
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
