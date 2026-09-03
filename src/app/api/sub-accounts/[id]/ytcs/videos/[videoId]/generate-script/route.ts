import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { getAdminDb } from "@/lib/firebase/admin";
import { getVideoProject, updateVideoProject } from "@/lib/server/ytcs-service";
import { getBusinessBrain } from "@/lib/server/business-brain-service";
import { buildScriptPrompt } from "@/lib/ytcs/script-prompt";
import { callAi } from "@/lib/comms/ai/openrouter";
import { estimateScriptGenerationCostUsd, YTCS_SCRIPT_MODEL_PRICING } from "@/lib/ytcs/script-generation-cost";

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

/**
 * Bug fix (2026-09-03, AI usage/cost visibility pass): this was
 * "anthropic/claude-sonnet-4-6" (hyphen) — not a real OpenRouter model
 * id. Verified directly against OpenRouter's own public
 * `GET /api/v1/models`: the real id is "anthropic/claude-sonnet-4.6"
 * (dot). OpenRouter was silently normalizing/accepting the incorrect
 * hyphenated slug — confirmed via this sub-account's own one real
 * successful generation, whose recorded `generatedScriptMeta.model`
 * came back as the correct dotted id even though the hyphenated id was
 * sent — so production was never actually broken, but relying on that
 * undocumented leniency was a latent risk. Corrected to the canonical
 * id; this is a model-id string fix only, not a change to prompt
 * content, script quality, or formatting.
 */
const SCRIPT_GENERATION_MODEL = "anthropic/claude-sonnet-4.6";
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
/**
 * PRODUCTION INCIDENT (2026-09-02): the original 90s value here left
 * only a 10s buffer under the old `maxDuration = 100`. On this repo's
 * single largest real prompt (~8,396 tokens, project c832488e) asking
 * for the full 6,000-token output cap, the real OpenRouter round trip
 * plus this route's own setup/Firestore overhead exceeded 100s before
 * this AbortController-based timeout ever got the chance to fire and
 * return a clean error — Vercel's platform-level hard kill fired
 * first ("Task timed out after 100 seconds", confirmed in production
 * logs), which never runs this route's own catch/finally, so the
 * client got no response at all (indefinite spinner), no usage
 * telemetry was recorded, and the `generatingScriptSince` lock was
 * never cleared. Raised substantially, with `maxDuration` below raised
 * to match, so a genuinely large/slow generation gets real room to
 * finish instead of racing the platform ceiling.
 */
const REQUEST_TIMEOUT_MS = 240_000;

/** Smallest reasonable duplicate-generation guard: a short-lived lock
 *  field on the project doc itself, not a job queue. A lock older than
 *  this is treated as stale (e.g. a crashed request) and ignored. */
const LOCK_STALE_MS = 2 * 60_000;

/** Established precedent for a long-running route (see
 *  src/app/api/social/publish/step/route.ts, which already uses this
 *  exact value on this deployment). Comfortably above the 240s AI-call
 *  timeout, leaving a real buffer for the surrounding Firestore
 *  reads/writes. */
export const maxDuration = 300;

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

    const startedAt = Date.now();
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
        durationMs: Date.now() - startedAt,
      });
      return NextResponse.json(
        { error: "Script generation failed — please try again." },
        { status: 502 },
      );
    }
    const durationMs = Date.now() - startedAt;

    const truncated = completion.finishReason === "length";
    // Cost: prefer OpenRouter's own real, per-call `usage.cost` (USD,
    // returned automatically on every response). Fall back to a
    // disclosed estimate, tagged with the pricing source/date it used,
    // only when the provider doesn't report one.
    const providerReportedCostUsd = completion.cost;
    const estimatedCostUsd =
      providerReportedCostUsd === undefined
        ? estimateScriptGenerationCostUsd(completion.promptTokens, completion.completionTokens)
        : undefined;

    const generatedScriptMeta = {
      model: completion.model,
      promptTokens: completion.promptTokens,
      completionTokens: completion.completionTokens,
      totalTokens: completion.totalTokens,
      finishReason: completion.finishReason,
      truncated,
      generatedAt: new Date().toISOString(),
      durationMs,
      ...(providerReportedCostUsd !== undefined ? { providerReportedCostUsd } : {}),
      ...(estimatedCostUsd !== undefined
        ? {
            estimatedCostUsd,
            pricingSource: YTCS_SCRIPT_MODEL_PRICING.source,
            pricingVerifiedDate: YTCS_SCRIPT_MODEL_PRICING.verifiedDate,
          }
        : {}),
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
      finishReason: completion.finishReason,
      durationMs,
      providerReportedCostUsd,
      estimatedCostUsd,
      pricingSource: estimatedCostUsd !== undefined ? YTCS_SCRIPT_MODEL_PRICING.source : undefined,
      pricingVerifiedDate: estimatedCostUsd !== undefined ? YTCS_SCRIPT_MODEL_PRICING.verifiedDate : undefined,
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
 * Usage/cost telemetry — internal visibility only (2026-09-03 pass): no
 * customer-facing credits, limits, or billing are built from this; it
 * exists so the real per-generation cost to Magnetix can be answered
 * later. One doc per generation attempt (success, failure, and
 * truncation all recorded, per the original design), mirroring the
 * shape of the existing `recordAiSuiteUsage()` best-effort-write
 * convention (never blocks the actual response; a telemetry write
 * failure is only logged). Cost prefers OpenRouter's own real,
 * per-call `usage.cost` (`providerReportedCostUsd`) and falls back to
 * a disclosed estimate (`estimatedCostUsd` + `pricingSource`/
 * `pricingVerifiedDate`) only when the provider doesn't report one —
 * see script-generation-cost.ts.
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
    finishReason?: string;
    durationMs?: number;
    providerReportedCostUsd?: number;
    estimatedCostUsd?: number;
    pricingSource?: string;
    pricingVerifiedDate?: string;
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
        finishReason: data.finishReason ?? null,
        durationMs: data.durationMs ?? null,
        providerReportedCostUsd: data.providerReportedCostUsd ?? null,
        estimatedCostUsd: data.estimatedCostUsd ?? null,
        pricingSource: data.pricingSource ?? null,
        pricingVerifiedDate: data.pricingVerifiedDate ?? null,
        generatedAt: FieldValue.serverTimestamp(),
      });
  } catch (err) {
    console.warn("[ytcs/generate-script] usage telemetry write failed", err);
  }
}
