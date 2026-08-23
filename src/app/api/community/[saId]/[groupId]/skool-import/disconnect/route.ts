import { NextResponse } from "next/server";
import { requireGroupApiAccess } from "@/lib/community/member-context";
import { deleteImportSession } from "@/lib/server/skool-import/session-store";

export const dynamic = "force-dynamic";

/** Explicit Disconnect — destroys the stored (encrypted) session immediately.
 *  There's no live process to kill (see headless-browser.ts's module
 *  comment), so this is just deleting the Firestore doc; nothing else to
 *  clean up. Same moderator-only authorization as connect/route.ts. */
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

  await deleteImportSession(saId, groupId, body.importSessionId);
  return NextResponse.json({ ok: true });
}
