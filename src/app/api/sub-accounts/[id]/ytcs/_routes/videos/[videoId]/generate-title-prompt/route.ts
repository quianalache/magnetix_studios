import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { getVideoProject, updateVideoProject } from "@/lib/server/ytcs-service";
import { getBusinessBrain } from "@/lib/server/business-brain-service";
import { buildTitlePrompt } from "@/lib/ytcs/title-prompt";

/**
 * POST /api/sub-accounts/[id]/ytcs/videos/[videoId]/generate-title-prompt
 *
 * Deterministic prompt assembly only — no AI model call (migration spec
 * §12: the Title Prompt Builder is template-based, not an in-app title
 * generator). Requires a real Final Script Draft (`compiledScript`) —
 * the migration spec's own missing-script guard is enforced server-side
 * here too, not just in the UI, since generating from a vague idea
 * instead of the actual script is the exact behavior this migration
 * explicitly moved away from. Writes ONLY `generatedTitlePrompt`.
 */
export async function POST(
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

  if (!project.compiledScript?.trim()) {
    return NextResponse.json(
      {
        error:
          "Add your final script first so the title prompt can be based on the actual video… not a vague idea wearing a blazer.",
      },
      { status: 400 },
    );
  }

  const businessBrain = await getBusinessBrain(subAccountId);

  const generatedTitlePrompt = buildTitlePrompt({
    compiledScript: project.compiledScript,
    businessBrain,
  });

  const updated = await updateVideoProject(subAccountId, videoId, { generatedTitlePrompt });
  return NextResponse.json({ ok: true, project: updated });
}
