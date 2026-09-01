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
 * PATCH is deliberately allowlisted to only the fields Phase 1's UI can
 * ever reach — project rename and the Input step's 6 starting points.
 * Deep Dive/Script Prompt Builder/Create Video/Titles/Publish fields
 * (compiledScript, generatedScriptPrompt, checklists, publish assets,
 * etc.) are NOT in this list, so even a malformed request from a future
 * un-reviewed client can't touch them before those steps are actually
 * built — the same defense-in-depth the Business Brain PATCH route uses.
 * `legacy`/`unknownFields`/migration provenance fields are never in any
 * allowlist at all.
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
  "brainDumpVoiceNotes",
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
