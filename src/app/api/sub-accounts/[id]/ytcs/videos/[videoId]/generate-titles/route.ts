import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { getAdminDb } from "@/lib/firebase/admin";
import { getVideoProject, updateVideoProject } from "@/lib/server/ytcs-service";
import { getBusinessBrain } from "@/lib/server/business-brain-service";
import { buildTitleGenerationPrompt, parseTitleGenerationResponse } from "@/lib/ytcs/title-generation";
import { callAi } from "@/lib/comms/ai/openrouter";
import { estimateScriptGenerationCostUsd, YTCS_SCRIPT_MODEL_PRICING } from "@/lib/ytcs/script-generation-cost";
import { recordTitleGenerationUsage } from "@/lib/server/ytcs-title-generations-service";

/**
 * POST /api/sub-accounts/[id]/ytcs/videos/[videoId]/generate-titles
 *
 * In-app Generate Titles (2026-09-09 Script + Titles AI UX pass) —
 * Titles' equivalent of In-App Script Generation. Reuses
 * `buildTitlePrompt()` completely unchanged for the real title
 * strategy (see title-prompt.ts); `buildTitleGenerationPrompt()` only
 * appends a JSON-response-format instruction on top, so the exact same
 * canonical prompt content is what a user would also get via the
 * existing external Title Prompt Builder / Copy Prompt path (unchanged,
 * untouched by this route). Server-side response validation
 * (`parseTitleGenerationResponse`) means a malformed model response is
 * never saved — the route returns a clean error instead.
 *
 * Writes ONLY `generatedTitles`/`generatedTitlesMeta` — `selectedTitle`/
 * `backupTitle` are never touched here; the user (or a card's "Use as
 * Primary/Backup" action) sets those explicitly. Same model + cost/
 * telemetry architecture as `generate-script`, reusing its pricing
 * constants (same model family) and duplicate-generation-lock pattern,
 * in its own `ytcsTitleGenerations` telemetry collection (feature:
 * "ytcs_title_generation") — see ytcs-title-generations-service.ts.
 *
 * Per-title analysis (2026-09-10): each of the 10 `generatedTitles`
 * entries now carries its own full explanation + 3 thumbnail ideas
 * (see title-generation.ts's own doc comment for why this is a
 * disclosed expansion beyond the real external prompt's own
 * strategy). The project's old top-level `titleTopPick`/
 * `titleThumbnailIdeas` fields are no longer written by a new
 * generation — the per-title data supersedes them — but stay in the
 * type/schema for backward compatibility with the one real project
 * that already has them from before this change; nothing reads them
 * anymore.
 */

const TITLE_GENERATION_MODEL = YTCS_SCRIPT_MODEL_PRICING.model;
function titleGenerationModel(): string {
  return process.env.YTCS_TITLE_MODEL?.trim() || TITLE_GENERATION_MODEL;
}

/**
 * Raised from 2000 (2026-09-10) — asking for a full explanation +
 * 3 thumbnail ideas on all 10 titles instead of just one shared set is
 * roughly an order of magnitude more generated content than before.
 * Reuses the script-generation route's own established ceiling rather
 * than inventing a new number — titles' JSON is still smaller in
 * practice than a full script, so this is real headroom, not a tight
 * fit.
 */
const MAX_OUTPUT_TOKENS = 6000;
/** Lower than script generation's 0.7 — this output must parse as
 *  exact-shape JSON; a little less creative variance helps reliability
 *  without meaningfully hurting title quality. */
const TEMPERATURE = 0.5;
/** Raised from 120s/150s (2026-09-10) proportionally to the larger
 *  expected output — still comfortably under the script route's own
 *  240s/300s, since titles' JSON remains smaller than a full script
 *  even at this larger size. */
const REQUEST_TIMEOUT_MS = 180_000;
const LOCK_STALE_MS = 2 * 60_000;
export const maxDuration = 210;

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
          "Add your final script first so titles can be based on the actual video… not a vague idea wearing a blazer.",
      },
      { status: 400 },
    );
  }

  if (project.generatingTitlesSince) {
    const lockAgeMs = Date.now() - new Date(project.generatingTitlesSince).getTime();
    if (Number.isFinite(lockAgeMs) && lockAgeMs < LOCK_STALE_MS) {
      return NextResponse.json(
        { error: "A title generation is already running for this project." },
        { status: 409 },
      );
    }
  }
  const videoDoc = getAdminDb().collection(`subAccounts/${subAccountId}/ytcsVideos`).doc(videoId);
  await videoDoc.set({ generatingTitlesSince: new Date().toISOString() }, { merge: true });

  try {
    const businessBrain = await getBusinessBrain(subAccountId);
    const prompt = buildTitleGenerationPrompt({
      compiledScript: project.compiledScript,
      businessBrain,
    });

    const startedAt = Date.now();
    let completion;
    try {
      completion = await callAi({
        model: titleGenerationModel(),
        messages: [{ role: "user", content: prompt }],
        maxTokens: MAX_OUTPUT_TOKENS,
        temperature: TEMPERATURE,
        timeoutMs: REQUEST_TIMEOUT_MS,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      console.error(`[ytcs/generate-titles] model call failed for ${videoId}: ${msg}`);
      void recordTitleGenerationUsage(subAccountId, videoId, {
        status: "failed",
        model: titleGenerationModel(),
        durationMs: Date.now() - startedAt,
      });
      return NextResponse.json({ error: "Title generation failed — please try again." }, { status: 502 });
    }
    const durationMs = Date.now() - startedAt;

    let titleSet;
    try {
      titleSet = parseTitleGenerationResponse(completion.text);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "The AI response wasn't in the expected format.";
      console.error(`[ytcs/generate-titles] response validation failed for ${videoId}: ${msg}`);
      void recordTitleGenerationUsage(subAccountId, videoId, {
        status: "failed",
        model: completion.model,
        promptTokens: completion.promptTokens,
        completionTokens: completion.completionTokens,
        totalTokens: completion.totalTokens,
        finishReason: completion.finishReason,
        durationMs,
      });
      return NextResponse.json(
        { error: `Title generation returned an unexpected format (${msg}). Please try again.` },
        { status: 502 },
      );
    }

    const providerReportedCostUsd = completion.cost;
    const estimatedCostUsd =
      providerReportedCostUsd === undefined
        ? estimateScriptGenerationCostUsd(completion.promptTokens, completion.completionTokens)
        : undefined;

    const generatedTitlesMeta = {
      model: completion.model,
      promptTokens: completion.promptTokens,
      completionTokens: completion.completionTokens,
      totalTokens: completion.totalTokens,
      finishReason: completion.finishReason,
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
      generatedTitles: titleSet.titles,
      generatedTitlesMeta,
    });

    void recordTitleGenerationUsage(subAccountId, videoId, {
      status: "success",
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

    return NextResponse.json({ ok: true, project: updated });
  } finally {
    await videoDoc.set({ generatingTitlesSince: FieldValue.delete() }, { merge: true });
  }
}
