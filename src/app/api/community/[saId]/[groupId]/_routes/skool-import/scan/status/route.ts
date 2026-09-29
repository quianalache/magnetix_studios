import { NextResponse } from "next/server";
import { requireGroupApiAccess } from "@/lib/community/member-context";
import { getScanResult } from "@/lib/server/skool-import/scan-store";

export const dynamic = "force-dynamic";

/**
 * Read-only poll target — the UI hits this on an interval to render
 * progress. Deliberately does nothing but read Firestore: no QStash
 * trigger, no browser work, so polling (even overlapping/rapid) can never
 * duplicate extraction. Only the scan/step QStash callback does real work.
 */
export async function GET(
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

  const importSessionId = new URL(request.url).searchParams.get("importSessionId");
  if (!importSessionId) {
    return NextResponse.json({ error: "Missing importSessionId." }, { status: 400 });
  }

  const scan = await getScanResult(saId, groupId, importSessionId);
  if (!scan) {
    return NextResponse.json({ error: "not-found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, scan });
}
