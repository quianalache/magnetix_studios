import "server-only";

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { revokeGoogleToken } from "@/lib/google-calendar/client";
import type { GoogleCalendarConnection } from "@/types/google-calendar";

/**
 * Disconnect the CALLER's own Google Calendar connection (self-service only
 * — this is a personal connection, not something an admin manages on
 * someone else's behalf). Revokes the token best-effort, deletes the
 * connection doc, and clears every event that connection had synced in.
 *
 *   POST /api/sub-accounts/[id]/google-calendar/disconnect
 */
export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const access = await requireSubAccountMember(request, id);
  if (access instanceof NextResponse) return access;

  const db = getAdminDb();
  const connRef = db.doc(`googleCalendarConnections/${id}_${access.uid}`);
  const snap = await connRef.get();
  if (!snap.exists) {
    return NextResponse.json({ ok: true, alreadyDisconnected: true });
  }
  const conn = snap.data() as GoogleCalendarConnection;

  await revokeGoogleToken(conn.accessToken);

  const eventsSnap = await db
    .collection("externalCalendarEvents")
    .where("subAccountId", "==", id)
    .where("uid", "==", access.uid)
    .get();
  const batch = db.batch();
  for (const doc of eventsSnap.docs) batch.delete(doc.ref);
  batch.delete(connRef);
  await batch.commit();

  return NextResponse.json({ ok: true });
}
