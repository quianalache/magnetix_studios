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
 * recordingNotes/editingNotes are now included (Phase 3A), but
 * finalTitle/youtubeDescription/publish assets/etc. are still not.
 * `finalVideoNotes` is deliberately still excluded — Phase 3A's Create
 * Video only specified recording notes, editing notes, checklists,
 * status, and the Edits Lab card; `finalVideoNotes` is a real field in
 * the schema but wasn't named in scope, so it isn't wired up yet.
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
  "deepDiveVoiceNotes",
  "productOfferDeepDiveAnswers",
  "productOfferDeepDiveVoiceNotes",
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
