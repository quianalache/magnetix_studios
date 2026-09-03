/**
 * Fallback cost estimate for YTCS Generate Script, used only when
 * OpenRouter's own real, per-call `usage.cost` (returned automatically
 * on every response — see openrouter.ts's `AiCompletionResult.cost`)
 * is unavailable for some reason. The provider-reported figure is
 * always preferred when present; this is a documented, disclosed
 * approximation, not a second source of truth.
 *
 * Verified 2026-09-03 directly against OpenRouter's public
 * `GET https://openrouter.ai/api/v1/models` endpoint for id
 * `anthropic/claude-sonnet-4.6`:
 *   "pricing": { "prompt": "0.000003", "completion": "0.000015" }
 * i.e. $3.00 / 1M input tokens, $15.00 / 1M output tokens. OpenRouter's
 * own pricing is stated in US dollars directly (not a separate credit
 * unit needing conversion). Re-verify against that endpoint before
 * trusting this for anything beyond a rough historical estimate —
 * OpenRouter pricing can change without notice, and this constant is
 * not kept in sync automatically.
 */
export const YTCS_SCRIPT_MODEL_PRICING = {
  model: "anthropic/claude-sonnet-4.6",
  promptPricePerTokenUsd: 0.000003,
  completionPricePerTokenUsd: 0.000015,
  source: "OpenRouter GET /api/v1/models (anthropic/claude-sonnet-4.6)",
  verifiedDate: "2026-09-03",
} as const;

export function estimateScriptGenerationCostUsd(
  promptTokens: number,
  completionTokens: number,
): number {
  return (
    promptTokens * YTCS_SCRIPT_MODEL_PRICING.promptPricePerTokenUsd +
    completionTokens * YTCS_SCRIPT_MODEL_PRICING.completionPricePerTokenUsd
  );
}
