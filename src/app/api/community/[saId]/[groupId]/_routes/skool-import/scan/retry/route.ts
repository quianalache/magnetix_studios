import { NextResponse } from "next/server";
import { requireGroupApiAccess } from "@/lib/community/member-context";
import { publishCallback, qstashIsConfigured } from "@/lib/automations/qstash";
import { getScanResult, getScanResultInternal, updateScanResult } from "@/lib/server/skool-import/scan-store";

export const dynamic = "force-dynamic";

/**
 * Retry a scan that stopped with `status: "failed"` and `failure.reason ===
 * "phase-error"` (scan/step gave up after MAX_PHASE_RETRIES consecutive
 * failures of one phase — see scan/step/route.ts). Resumes from that
 * phase's own persisted checkpoint (Members/Posts/Comments already
 * checkpoint their progress in `_internal` as they go) rather than
 * restarting the scan — no completed phase is touched, no duplicate
 * normalized results, no re-triggered Skool verification email (finalize's
 * own `verificationInitiatedAt` guard is untouched by this route).
 *
 * A `session-expired` failure is NOT retryable here — there's no cookie
 * session left to resume with, the owner has to reconnect (a fresh Connect
 * + a fresh scan), which the client already knows to offer separately.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ saId: string; groupId: string }> },
) {
  const { saId, groupId } = await params;
  const access = await requireGroupApiAccess(saId, groupId);
  if (access.kind === "error") {
    return NextResponse.json({ error: access.message }, { status: access.status });
  }
  if (access.membership.role !== "moderator") {
    return NextResponse.json({ error: "Moderators only" }, { status: 403 });
  }

  let body: { importSessionId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  if (!body.importSessionId || typeof body.importSessionId !== "string") {
    return NextResponse.json({ error: "Missing importSessionId." }, { status: 400 });
  }
  const importSessionId = body.importSessionId;

  if (!qstashIsConfigured()) {
    return NextResponse.json({ error: "QStash not configured" }, { status: 503 });
  }

  // Scoped read first (checks subAccountId/groupId ownership), then the
  // internal read for the phase/cursor detail the public shape omits.
  const scoped = await getScanResult(saId, groupId, importSessionId);
  if (!scoped) {
    return NextResponse.json({ error: "not-found", message: "Scan not found." }, { status: 404 });
  }
  if (scoped.status !== "failed" || !scoped.failure) {
    return NextResponse.json(
      { error: "not-retryable", message: "This scan isn't in a state that can be retried." },
      { status: 409 },
    );
  }
  if (scoped.failure.reason !== "phase-error" || !scoped.failure.retryable) {
    return NextResponse.json(
      {
        error: "not-retryable",
        message:
          scoped.failure.reason === "session-expired"
            ? "Your Skool connection expired. Reconnect to scan again."
            : "This scan can't be retried automatically.",
      },
      { status: 409 },
    );
  }
  const phase = scoped.failure.phase;
  if (!phase) {
    return NextResponse.json(
      { error: "not-retryable", message: "This scan can't be retried automatically." },
      { status: 409 },
    );
  }

  const internal = await getScanResultInternal(importSessionId);
  if (!internal) {
    return NextResponse.json({ error: "not-found", message: "Scan not found." }, { status: 404 });
  }

  await updateScanResult(importSessionId, {
    status: "scanning",
    failure: null,
    "_internal.phaseRetryCount": 0,
    [`phases.${phase}`]: { status: "scanning", detail: scoped.phases[phase]?.detail ?? null, message: null },
  });

  await publishCallback({
    pathname: `/api/community/${saId}/${groupId}/skool-import/scan/step`,
    body: { importSessionId, phase },
    delaySeconds: 0,
    deduplicationId: `skoolscan_${importSessionId}_${phase}_retry_${Date.now()}`,
  });

  return NextResponse.json({ ok: true });
}
