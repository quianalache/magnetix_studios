import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { getVideoProject } from "@/lib/server/ytcs-service";
import { listRetainedScriptGenerations } from "@/lib/server/ytcs-script-generations-service";

/**
 * GET /api/sub-accounts/[id]/ytcs/videos/[videoId]/script-generations
 *
 * "Previous Generations" list for Script Prompt Builder (2026-09-09
 * Script + Titles AI UX pass) — up to the 3 most recently retained
 * script generations for this video, newest first, full text included
 * (bounded to 3 modest-size scripts, so one call is enough — no
 * separate "view" round trip needed). See
 * ytcs-script-generations-service.ts for the retention architecture.
 */
export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string; videoId: string }> },
) {
  const { id: subAccountId, videoId } = await ctx.params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;

  const project = await getVideoProject(subAccountId, videoId);
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const generations = await listRetainedScriptGenerations(subAccountId, videoId);
  return NextResponse.json({ ok: true, generations });
}
