import "server-only";

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import type { BroadcastDoc } from "@/types";

export const dynamic = "force-dynamic";

/**
 * Persistent Broadcast Drafts V1 (2026-08-27) — delete a draft. Deliberately
 * narrow: only ever deletes a broadcast whose status is "draft". This is
 * NOT a general Broadcast-deletion endpoint and never will be — a launched
 * send (queued/sending/completed/failed/cancelled) keeps its full audit
 * trail forever, same as every other Broadcast safety control in this
 * project. No blocker-checking needed (unlike Contact deletion) since a
 * draft has no downstream references — nothing points at it except the
 * operator's own composer tab.
 *
 * Does NOT delete the draft's uploaded Storage images/video thumbnails
 * (see upload-image.ts's own doc comment — there is no cleanup job for
 * abandoned drafts' uploads, a pre-existing, acknowledged gap). Deleting
 * them here would risk breaking a Template saved from this same draft,
 * since "Save as template" copies the rendered content BY VALUE, image
 * URLs included — the same storage object can legitimately be referenced
 * from outside the draft being deleted, and this route has no reliable way
 * to check that before deleting.
 */
export async function DELETE(
  request: Request,
  ctx: { params: Promise<{ broadcastId: string }> },
) {
  const { broadcastId } = await ctx.params;
  if (!broadcastId) {
    return NextResponse.json({ error: "Missing broadcastId" }, { status: 400 });
  }

  const db = getAdminDb();
  const ref = db.collection("broadcasts").doc(broadcastId);
  const snap = await ref.get();
  if (!snap.exists) {
    return NextResponse.json({ ok: true, alreadyDeleted: true });
  }
  const broadcast = snap.data() as BroadcastDoc;

  const access = await requireSubAccountMember(request, broadcast.subAccountId);
  if (access instanceof NextResponse) return access;

  if (broadcast.status !== "draft") {
    return NextResponse.json(
      { error: "Only drafts can be deleted. This broadcast has already been sent." },
      { status: 409 },
    );
  }

  await ref.delete();
  return NextResponse.json({ ok: true });
}
