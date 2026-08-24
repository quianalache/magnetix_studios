import { NextResponse } from "next/server";
import { requireGroupApiAccess } from "@/lib/community/member-context";
import { getImportSession } from "@/lib/server/skool-import/session-store";
import { createScanResult, getScanResult } from "@/lib/server/skool-import/scan-store";
import { publishCallback, qstashIsConfigured } from "@/lib/automations/qstash";

export const dynamic = "force-dynamic";

/**
 * Skool Import → Scan, start. Same moderator-only authorization as
 * connect/route.ts. Reuses the EXISTING, already-authenticated Step 1
 * import session — no re-login, no new credentials. Creates a scan result
 * doc and enqueues the first QStash step, then returns immediately: Scan
 * runs as a real background job (see scan/step/route.ts), not a single
 * long synchronous request — see the Scan report's execution-model
 * section for why.
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

  const importSession = await getImportSession(saId, groupId, body.importSessionId);
  if (!importSession) {
    return NextResponse.json(
      { error: "session-expired", message: "Your Skool connection expired. Reconnect to continue." },
      { status: 410 },
    );
  }

  if (!qstashIsConfigured()) {
    return NextResponse.json(
      { error: "not-configured", message: "Scanning isn't available on this deployment yet." },
      { status: 503 },
    );
  }

  // Idempotent — a scan result may already exist (page refresh re-hitting
  // "start" before the UI noticed it should just poll status instead).
  const existing = await getScanResult(saId, groupId, importSession.id);
  if (!existing) {
    await createScanResult({
      importSessionId: importSession.id,
      subAccountId: saId,
      groupId,
      skoolGroupSlug: importSession.skoolGroupSlug,
    });
    await publishCallback({
      pathname: `/api/community/${saId}/${groupId}/skool-import/scan/step`,
      body: { importSessionId: importSession.id, phase: "community" },
      delaySeconds: 0,
      deduplicationId: `skoolscan_${importSession.id}_community`,
    });
  }

  return NextResponse.json({ ok: true, importSessionId: importSession.id });
}
