import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { getVideoProject, updateVideoProject } from "@/lib/server/ytcs-service";
import { getScriptGenerationForVideo } from "@/lib/server/ytcs-script-generations-service";

/**
 * POST /api/sub-accounts/[id]/ytcs/videos/[videoId]/script-generations/
 *   [generationId]/use-as-current
 *
 * "Use as Current" (2026-09-09 Script + Titles AI UX pass) — loads one
 * of the up-to-3 retained prior generations back into the active
 * Generated Script editor. Writes ONLY `generatedScript` +
 * `activeScriptGenerationId`; deliberately never touches
 * `compiledScript` (Final Script Draft) — recovering an older
 * generation into the working editor is not the same as approving it,
 * per instruction. `getScriptGenerationForVideo` verifies the
 * generation doc actually belongs to this exact video before anything
 * is read from it, so a generation id can't be replayed against a
 * different project.
 */
export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string; videoId: string; generationId: string }> },
) {
  const { id: subAccountId, videoId, generationId } = await ctx.params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;

  const project = await getVideoProject(subAccountId, videoId);
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const generation = await getScriptGenerationForVideo(subAccountId, videoId, generationId);
  if (!generation || !generation.scriptText) {
    return NextResponse.json(
      { error: "That generation is no longer available to recover." },
      { status: 404 },
    );
  }

  const updated = await updateVideoProject(subAccountId, videoId, {
    generatedScript: generation.scriptText,
    activeScriptGenerationId: generation.id,
  });

  return NextResponse.json({ ok: true, project: updated });
}
