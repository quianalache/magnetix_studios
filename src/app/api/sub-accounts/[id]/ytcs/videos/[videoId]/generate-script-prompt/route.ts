import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { getVideoProject, updateVideoProject } from "@/lib/server/ytcs-service";
import { getBusinessBrain } from "@/lib/server/business-brain-service";
import { buildScriptPrompt } from "@/lib/ytcs/script-prompt";

/**
 * POST /api/sub-accounts/[id]/ytcs/videos/[videoId]/generate-script-prompt
 *
 * Deterministic prompt assembly only — no AI model call, no OpenRouter
 * usage (migration spec §9: Script Prompt Builder is template-based, not
 * an in-app script writer). Resolves the project's currently-selected
 * Business Brain Stories/Frameworks by id, builds the fully-resolved
 * prompt via buildScriptPrompt(), and writes ONLY `generatedScriptPrompt`
 * — `compiledScript` (Final Script Draft) is never touched by this
 * route, satisfying the critical regeneration-must-not-overwrite rule.
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

  const businessBrain = await getBusinessBrain(subAccountId);

  const selectedStoryIds = new Set(project.scriptBuilderSelectedStoryProofIds ?? []);
  const selectedFrameworkIds = new Set(project.scriptBuilderSelectedFrameworkIds ?? []);
  const selectedStories = (businessBrain?.stories ?? []).filter((s) => selectedStoryIds.has(s.id));
  const selectedFrameworks = (businessBrain?.frameworks ?? []).filter((f) => selectedFrameworkIds.has(f.id));

  const generatedScriptPrompt = buildScriptPrompt({
    project,
    businessBrain,
    selectedStories,
    selectedFrameworks,
  });

  const updated = await updateVideoProject(subAccountId, videoId, { generatedScriptPrompt });
  return NextResponse.json({ ok: true, project: updated });
}
