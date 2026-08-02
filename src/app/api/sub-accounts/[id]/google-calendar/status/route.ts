import "server-only";

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import type { GoogleCalendarConnection } from "@/types/google-calendar";

function tsToIso(v: unknown): string | null {
  if (!v) return null;
  const m = v as { toDate?: () => Date };
  return typeof m.toDate === "function" ? m.toDate().toISOString() : null;
}

/**
 * Token-free projection of the CALLER's own Google Calendar connection —
 * the only way the client ever learns anything about
 * `googleCalendarConnections`, since that collection denies all client
 * reads (see firestore.rules). Never includes the access/refresh tokens.
 *
 *   GET /api/sub-accounts/[id]/google-calendar/status
 */
export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const access = await requireSubAccountMember(request, id);
  if (access instanceof NextResponse) return access;

  const snap = await getAdminDb()
    .doc(`googleCalendarConnections/${id}_${access.uid}`)
    .get();
  if (!snap.exists) {
    return NextResponse.json({ connected: false });
  }
  const conn = snap.data() as GoogleCalendarConnection;
  return NextResponse.json({
    connected: true,
    googleAccountEmail: conn.googleAccountEmail || null,
    lastSyncedAt: tsToIso(conn.lastSyncedAt),
  });
}
