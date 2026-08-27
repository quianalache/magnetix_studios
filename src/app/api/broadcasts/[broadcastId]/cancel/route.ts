import "server-only";

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import type { BroadcastDoc } from "@/types";

export const dynamic = "force-dynamic";

/**
 * Production safety control (2026-08-26) — Cancel Broadcast, the real kill
 * switch this feature was missing during a live incident (see
 * docs/debug notes on broadcast nf4y6KBytpIAwzO0l17d, where the only
 * available response was manually deleting the still-queued `sends` rows
 * from Firestore so the step route's pre-existing "missing row" no-op would
 * absorb the in-flight QStash callbacks).
 *
 * This route only ever flips `status` on the broadcast doc — it does NOT
 * touch any `sends` rows itself. Rows still `queued` at cancel time settle
 * to `skipped` (reason "cancelled") lazily, one at a time, as their own
 * QStash callback fires and checks the parent status (see
 * /api/broadcasts/email/step). That keeps this endpoint O(1) regardless of
 * audience size, and means there is never a window where a row is deleted
 * out from under an in-flight callback.
 *
 * Idempotent: cancelling an already-cancelled/completed/failed broadcast is
 * a no-op 200, not an error — an operator double-clicking Cancel (or a
 * retried request) never fails or corrupts state.
 */
export async function POST(
  request: Request,
  ctx: { params: Promise<{ broadcastId: string }> },
) {
  const { broadcastId } = await ctx.params;
  if (!broadcastId) {
    return NextResponse.json({ error: "Missing broadcastId" }, { status: 400 });
  }

  const db = getAdminDb();
  const broadcastRef = db.collection("broadcasts").doc(broadcastId);
  const snap = await broadcastRef.get();
  if (!snap.exists) {
    return NextResponse.json({ error: "Broadcast not found" }, { status: 404 });
  }
  const broadcast = snap.data() as BroadcastDoc;

  const access = await requireSubAccountMember(request, broadcast.subAccountId);
  if (access instanceof NextResponse) return access;

  // Already terminal — nothing to do. Covers double-clicks, retried
  // requests, and cancelling a broadcast that finished draining or failed
  // for an unrelated reason before the request landed.
  if (
    broadcast.status === "cancelled" ||
    broadcast.status === "completed" ||
    broadcast.status === "failed"
  ) {
    return NextResponse.json({ ok: true, status: broadcast.status, alreadyTerminal: true });
  }
  // status is "queued" or "sending" — the only cancellable states.

  let cancelledByName = access.email;
  try {
    const u = await getAdminAuth().getUser(access.uid);
    cancelledByName = u.displayName || u.email || access.email;
  } catch {
    // Fall through with the email.
  }

  await broadcastRef.update({
    status: "cancelled",
    cancelledAt: FieldValue.serverTimestamp(),
    cancelledBy: { displayName: cancelledByName, email: access.email },
    completedAt: FieldValue.serverTimestamp(),
  });

  return NextResponse.json({ ok: true, status: "cancelled" });
}
