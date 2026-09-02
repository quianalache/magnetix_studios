import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { getAdminDb } from "@/lib/firebase/admin";
import { getVideoProject, updateVideoProject } from "@/lib/server/ytcs-service";
import { getBusinessBrain } from "@/lib/server/business-brain-service";
import { buildScriptPrompt } from "@/lib/ytcs/script-prompt";
import { callAi } from "@/lib/comms/ai/openrouter";

/**
 * POST /api/sub-accounts/[id]/ytcs/videos/[videoId]/generate-script
 *
 * In-app Generate Script (product decision: approved, following the
 * AI capability diagnostic). Reuses `buildScriptPrompt()` completely
 * unchanged — the deterministic prompt-assembly strategy (regular
 * YouTube Video / Product Showcase / Signature Offer Video, Business
 * Brain context, selected Stories + Proof, selected Frameworks, Script
 * Output Type, Depth Preference) is not touched by this route at all.
 * The only new thing is: the assembled prompt is now ALSO sent to the
 * model server-side, instead of requiring the user to copy it into an
 * external AI tool.
 *
 * Writes ONLY `generatedScript` + `generatedScriptMeta` — `compiledScript`
 * (Final Script Draft) is never touched here, same critical
 * regeneration-must-not-overwrite rule as `generate-script-prompt`. A
 * failed generation leaves any existing `generatedScript` completely
 * untouched (the write only happens after a successful model call).
 */

const SCRIPT_GENERATION_MODEL = "anthropic/claude-sonnet-4-6";
/** Server-side model config, mirroring the existing `defaultAiModel()`
 *  idiom (openrouter.ts) — a dedicated env override rather than sharing
 *  AI_SUITE_MODEL, so changing the AI Suite's model can never silently
 *  change YTCS's script-generation model too. */
function scriptGenerationModel(): string {
  return process.env.YTCS_SCRIPT_MODEL?.trim() || SCRIPT_GENERATION_MODEL;
}

/** Real-data-justified headroom (diagnostic: largest real Final Script
 *  Draft ≈ 2,703 tokens; largest real Script Prompt ≈ 8,396 tokens). */
const MAX_OUTPUT_TOKENS = 6000;
const TEMPERATURE = 0.7;
/** A little under the request timeout below, so a genuinely slow model
 *  response still gets a normal AbortError rather than always racing
 *  the function's own duration ceiling. */
const REQUEST_TIMEOUT_MS = 90_000;

/** Smallest reasonable duplicate-generation guard: a short-lived lock
 *  field on the project doc itself, not a job queue. A lock older than
 *  this is treated as stale (e.g. a crashed request) and ignored. */
const LOCK_STALE_MS = 2 * 60_000;

/** Established precedent for a long-running route (see
 *  src/app/api/social/publish/step/route.ts). Comfortably above the
 *  90s AI-call timeout, leaving room for the surrounding Firestore
 *  reads/writes. */
export const maxDuration = 100;

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

  // Duplicate-generation guard — reject only if a lock is present AND
  // recent; a stale lock (e.g. the previous request crashed) never
  // permanently blocks the project.
  if (project.generatingScriptSince) {
    const lockAgeMs = Date.now() - new Date(project.generatingScriptSince).getTime();
    if (Number.isFinite(lockAgeMs) && lockAgeMs < LOCK_STALE_MS) {
      return NextResponse.json(
        { error: "A script generation is already running for this project." },
        { status: 409 },
      );
    }
  }
  await getAdminDb()
    .collection(`subAccounts/${subAccountId}/ytcsVideos`)
    .doc(videoId)
    .set({ generatingScriptSince: new Date().toISOString() }, { merge: true });

  try {
    const businessBrain = await getBusinessBrain(subAccountId);

    const selectedStoryIds = new Set(project.scriptBuilderSelectedStoryProofIds ?? []);
    const selectedFrameworkIds = new Set(project.scriptBuilderSelectedFrameworkIds ?? []);
    const selectedStories = (businessBrain?.stories ?? []).filter((s) => selectedStoryIds.has(s.id));
    const selectedFrameworks = (businessBrain?.frameworks ?? []).filter((f) => selectedFrameworkIds.has(f.id));

    const prompt = buildScriptPrompt({
      project,
      businessBrain,
      selectedStories,
      selectedFrameworks,
    });

    let completion;
    try {
      completion = await callAi({
        model: scriptGenerationModel(),
        messages: [{ role: "user", content: prompt }],
        maxTokens: MAX_OUTPUT_TOKENS,
        temperature: TEMPERATURE,
        timeoutMs: REQUEST_TIMEOUT_MS,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      console.error(`[ytcs/generate-script] model call failed for ${videoId}: ${msg}`);
      void recordScriptGenerationUsage(subAccountId, videoId, {
        status: "failed",
        model: scriptGenerationModel(),
      });
      return NextResponse.json(
        { error: "Script generation failed — please try again." },
        { status: 502 },
      );
    }

    const truncated = completion.finishReason === "length";
    const generatedScriptMeta = {
      model: completion.model,
      promptTokens: completion.promptTokens,
      completionTokens: completion.completionTokens,
      totalTokens: completion.totalTokens,
      finishReason: completion.finishReason,
      truncated,
      generatedAt: new Date().toISOString(),
    };

    const updated = await updateVideoProject(subAccountId, videoId, {
      generatedScript: completion.text,
      generatedScriptMeta,
    });

    void recordScriptGenerationUsage(subAccountId, videoId, {
      status: truncated ? "truncated" : "success",
      model: completion.model,
      promptTokens: completion.promptTokens,
      completionTokens: completion.completionTokens,
      totalTokens: completion.totalTokens,
    });

    return NextResponse.json({ ok: true, project: updated, truncated });
  } finally {
    // Always clear the lock, success or failure — a failed generation
    // must never permanently block future attempts.
    await getAdminDb()
      .collection(`subAccounts/${subAccountId}/ytcsVideos`)
      .doc(videoId)
      .set({ generatingScriptSince: FieldValue.delete() }, { merge: true });
  }
}

/**
 * Usage telemetry only — no cost calculation, no credit enforcement
 * (explicitly deferred per this phase's instruction). One doc per
 * generation attempt, mirroring the shape of the existing
 * `recordAiSuiteUsage()` best-effort-write convention (never blocks
 * the actual response; a telemetry write failure is only logged).
 */
async function recordScriptGenerationUsage(
  subAccountId: string,
  videoId: string,
  data: {
    status: "success" | "failed" | "truncated";
    model: string;
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  },
): Promise<void> {
  try {
    await getAdminDb()
      .collection(`subAccounts/${subAccountId}/ytcsScriptGenerations`)
      .add({
        subAccountId,
        videoId,
        feature: "ytcs_script_generation",
        model: data.model,
        promptTokens: data.promptTokens ?? null,
        completionTokens: data.completionTokens ?? null,
        totalTokens: data.totalTokens ?? null,
        status: data.status,
        generatedAt: FieldValue.serverTimestamp(),
      });
  } catch (err) {
    console.warn("[ytcs/generate-script] usage telemetry write failed", err);
  }
}
