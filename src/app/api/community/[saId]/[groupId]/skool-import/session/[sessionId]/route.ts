import { NextResponse } from "next/server";
import { requireGroupApiAccess } from "@/lib/community/member-context";
import { getImportSession } from "@/lib/server/skool-import/session-store";

export const dynamic = "force-dynamic";

/** Lets the Connect UI recover its "Connected" state after a page refresh
 *  without re-authenticating — reads only the public session fields (see
 *  session-store.ts's `PublicSkoolImportSession`), never cookies. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ saId: string; groupId: string; sessionId: string }> },
) {
  const { saId, groupId, sessionId } = await params;
  const access = await requireGroupApiAccess(saId, groupId);
  if (access.kind === "error") {
    return NextResponse.json({ error: access.message }, { status: access.status });
  }
  if (access.membership.role !== "moderator") {
    return NextResponse.json({ error: "Moderators only" }, { status: 403 });
  }

  const session = await getImportSession(saId, groupId, sessionId);
  if (!session) {
    return NextResponse.json({ error: "not-found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, session });
}
