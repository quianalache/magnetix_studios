import { NextResponse } from "next/server";
import { requireGroupApiAccess } from "@/lib/community/member-context";
import { deleteScanResult } from "@/lib/server/skool-import/scan-store";
import { deleteImportSession } from "@/lib/server/skool-import/session-store";

export const dynamic = "force-dynamic";

/**
 * Cancel Scan — deletes the scan result AND the underlying Step 1 import
 * session (matching the Connect Disconnect behavior; re-scanning after a
 * cancel means reconnecting, by design). Any QStash step already in
 * flight for this scan checks the scan doc's existence/status first (see
 * scan/step/route.ts) and no-ops once this doc is gone, so a
 * just-scheduled continuation can never revive a cancelled scan or write
 * to a deleted doc. No Magnetix Community data is ever touched either way
 * — there's none to clean up, Scan is zero-write by construction.
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

  await deleteScanResult(saId, groupId, body.importSessionId);
  await deleteImportSession(saId, groupId, body.importSessionId);

  return NextResponse.json({ ok: true });
}
