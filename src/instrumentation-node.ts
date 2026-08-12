/**
 * Node.js-only instrumentation body — split out of instrumentation.ts
 * (2026-08-12), matching Next's documented pattern for this exact
 * situation: one dynamic `import()` of a whole separate module, guarded
 * by the block-form `if (NEXT_RUNTIME === "nodejs") { … }` in the caller,
 * is what Next's Edge-bundle dead-code elimination actually prunes before
 * webpack needs to resolve it. See instrumentation.ts's own doc comment
 * for the exact shape that mattered (a negated early-return guard was NOT
 * pruned and broke the build).
 */
export async function registerNode() {
  // Install API-key log redaction BEFORE anything else writes a log line.
  // Idempotent — safe to call on every cold start. Patches console.* so
  // any `lsk_<live|test>_*` token in any future log call gets its secret
  // half masked out.
  const { installLogRedaction } = await import("@/lib/api/redact");
  installLogRedaction();

  // Auto-register the LeadStack daily/hourly cron schedules in QStash.
  // Lets buyers skip the "click into QStash dashboard, create schedules"
  // onboarding step — the schedules appear on the first production
  // cold start after env vars are set. Idempotent via stable
  // scheduleIds + cached for 24h via a Firestore marker doc.
  const { ensureSchedulesRegistered } = await import("@/lib/qstash/register-schedules");
  void ensureSchedulesRegistered().catch((err) => {
    console.warn("[instrumentation] schedule registration failed", err);
  });

  const { sendHeartbeat } = await import("@/lib/gitpage/heartbeat");

  // Fire-and-forget. The 5s timeout inside sendHeartbeat protects us if
  // gitpage is slow; we never want the heartbeat to block boot.
  void sendHeartbeat().catch((err) => {
    console.warn("[instrumentation] gitpage heartbeat threw", err);
  });
}
