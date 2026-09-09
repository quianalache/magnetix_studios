import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";

/**
 * In-app Generate Titles telemetry (2026-09-09 Script + Titles AI UX
 * pass) — same discipline/shape as `ytcs-script-generations-service.ts`
 * (which itself mirrors the original `generate-script` telemetry write),
 * but its own collection (`ytcsTitleGenerations`) rather than the
 * script one: titles have no "last N recoverable generations" history
 * requirement at launch (regenerating replaces the current 10-title
 * result outright — see `generatedTitles` on the project doc itself),
 * so there's no reason to carry full generated-title text here at all —
 * this is metadata-only, exactly like the script telemetry was before
 * script-text retention was added. Internal cost/usage visibility only,
 * per instruction — no customer-facing credits or limits.
 */
export interface TitleGenerationUsageData {
  status: "success" | "failed";
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
}

export async function recordTitleGenerationUsage(
  subAccountId: string,
  videoId: string,
  data: TitleGenerationUsageData,
): Promise<void> {
  try {
    await getAdminDb()
      .collection(`subAccounts/${subAccountId}/ytcsTitleGenerations`)
      .add({
        subAccountId,
        videoId,
        feature: "ytcs_title_generation",
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
    console.warn("[ytcs/generate-titles] usage telemetry write failed", err);
  }
}
