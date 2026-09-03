import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import {
  deleteVideoProject,
  getVideoProject,
  updateVideoProject,
} from "@/lib/server/ytcs-service";
import type { YtcsVideoProject } from "@/types/ytcs";

/**
 * GET/PATCH/DELETE /api/sub-accounts/[id]/ytcs/videos/[videoId]
 *
 * PATCH is deliberately allowlisted to only the fields Phase 1+2's UI can
 * ever reach — project rename, the Input step's 6 starting points, Deep
 * Dive (normal + Product/Offer), and Script Prompt Builder. Create Video/
 * Titles/Publish fields (checklists, publish assets, etc.) are NOT in
 * this list, so even a malformed request from a future un-reviewed
 * client can't touch them before those steps are actually built — the
 * same defense-in-depth the Business Brain PATCH route uses.
 * `legacy`/`unknownFields`/migration provenance fields are never in any
 * allowlist at all. Deliberately still excluded pending their own phase:
 * `compiledScript` (Final Script Draft) IS included — Phase 2 explicitly
 * builds it — createVideoStatus/recordingChecklist/editingChecklist/
 * recordingNotes/editingNotes (Phase 3A) and generatedTitlePrompt/
 * selectedTitle/backupTitle/titleNotes/finalTitle/youtubeDescription/
 * tagsKeywords/pinnedComment/uploadNotes/youtubeLink/publishDate/
 * uploadChecklist/optimizationChecklist/finalReviewChecklist (Phase 3B)
 * are now included. `finalVideoNotes` and `communityPost` are
 * deliberately still excluded — neither was named in scope by any
 * completed phase's instructions (`finalVideoNotes` is a real, always-
 * empty field; `communityPost` is real but its UI ownership is still
 * an open product question per the migration spec §13/§18 — it must
 * round-trip untouched, not be silently writable by this route).
 * `archived` (final completion phase, Video Library) is now included.
 * `sourceIdeaId` stays out of the allowlist deliberately — it's only
 * ever set once, at creation time by Turn Into Video, never edited
 * afterward by any UI action.
 * `generatedScript` (in-app script generation) is now included — the
 * user can edit the generated draft and save those edits, same as
 * `compiledScript`. `generatedScriptMeta` and `generatingScriptSince`
 * stay OUT of this allowlist — both are written only by the dedicated
 * generate-script route (directly via `updateVideoProject`, bypassing
 * this filter server-side), never by a client-supplied PATCH body.
 */

const EDITABLE_KEYS = [
  "name",
  "startingPointType",
  "currentStep",
  "status",
  "rawTranscript",
  "selectedInputQuestion",
  "shortFormType",
  "storyId",
  "storyName",
  "storyProblem",
  "storyPursuit",
  "storyPayoff",
  "storyLesson",
  "storyType",
  "framework",
  "frameworkId",
  "productOfferInput",
  // Deep Dive (Phase 2)
  "deepDiveAnswers",
  "generatedDeepDiveQuestions",
  "productOfferDeepDiveAnswers",
  // deepDiveVoiceNotes / productOfferDeepDiveVoiceNotes deliberately
  // removed from this allowlist (2026-09-03 dictation change) — no
  // active UI writes them anymore (Deep Dive dictation is browser-
  // native and never uploads audio), so a client-supplied PATCH can no
  // longer touch them. Real historical values on existing projects are
  // untouched — this only affects future writes, and GET still returns
  // them unchanged for the read-only legacy playback UI.
  // Script Prompt Builder (Phase 2)
  "scriptOutputType",
  "depthPreference",
  "scriptBuilderExtraNotes",
  "scriptBuilderSelectedFrameworkIds",
  "scriptBuilderSelectedStoryProofIds",
  "scriptBuilderVoiceNotes",
  "generatedScriptPrompt",
  "compiledScript",
  "brainDumpVoiceNotes",
  // Create Video (Phase 3A)
  "createVideoStatus",
  "recordingChecklist",
  "editingChecklist",
  "recordingNotes",
  "editingNotes",
  // Titles (Phase 3B)
  "generatedTitlePrompt",
  "selectedTitle",
  "backupTitle",
  "titleNotes",
  // Publish (Phase 3B)
  "finalTitle",
  "youtubeDescription",
  "tagsKeywords",
  "pinnedComment",
  "uploadNotes",
  "youtubeLink",
  "publishDate",
  "uploadChecklist",
  "optimizationChecklist",
  "finalReviewChecklist",
  // Video Library (final completion phase)
  "archived",
  // In-app script generation
  "generatedScript",
] as const;

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
  return NextResponse.json({ ok: true, project });
}

export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string; videoId: string }> },
) {
  const { id: subAccountId, videoId } = await ctx.params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;

  const existing = await getVideoProject(subAccountId, videoId);
  if (!existing) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const updates: Partial<YtcsVideoProject> = {};
  for (const key of EDITABLE_KEYS) {
    if (key in body) {
      (updates as Record<string, unknown>)[key] = body[key];
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json(
      { error: "No editable fields in the request body." },
      { status: 400 },
    );
  }

  const project = await updateVideoProject(subAccountId, videoId, updates);
  return NextResponse.json({ ok: true, project });
}

export async function DELETE(
  request: Request,
  ctx: { params: Promise<{ id: string; videoId: string }> },
) {
  const { id: subAccountId, videoId } = await ctx.params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;

  const existing = await getVideoProject(subAccountId, videoId);
  if (!existing) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  await deleteVideoProject(subAccountId, videoId);
  return NextResponse.json({ ok: true });
}
