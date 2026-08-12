import "server-only";

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { connectionId } from "@/lib/google-calendar/connection";
import { syncOneConnection } from "@/lib/google-calendar/sync";
import type { GoogleCalendarConnection } from "@/types/google-calendar";

function tsToIso(v: unknown): string | null {
  if (!v) return null;
  const m = v as { toDate?: () => Date };
  return typeof m.toDate === "function" ? m.toDate().toISOString() : null;
}

/**
 * On-demand "Sync Now" — the CALLER's own connection only, pulled
 * immediately instead of waiting for the next 15-minute QStash tick.
 * 2026-08-12. Calls the exact same `syncOneConnection()` the recurring
 * cron uses (lib/google-calendar/sync.ts) — no second sync
 * implementation. Runs independently of the recurring schedule; doesn't
 * touch or reset it (they share `syncTokens`, so whichever runs next —
 * this or the next 15-minute tick — just picks up from wherever the other
 * left off, same as two ticks of the recurring sync back to back).
 *
 *   POST /api/sub-accounts/[id]/google-calendar/sync-now
 */
export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const access = await requireSubAccountMember(request, id);
  if (access instanceof NextResponse) return access;

  const db = getAdminDb();
  const connId = connectionId(id, access.uid);
  const connRef = db.doc(`googleCalendarConnections/${connId}`);
  const snap = await connRef.get();
  if (!snap.exists) {
    return NextResponse.json({ error: "Not connected" }, { status: 404 });
  }
  const conn = snap.data() as GoogleCalendarConnection;

  const result = await syncOneConnection(connId, conn);

  const freshSnap = await connRef.get();
  const lastSyncedAt = tsToIso(freshSnap.data()?.lastSyncedAt);

  if (!result.ok && result.synced === 0 && !lastSyncedAt) {
    return NextResponse.json({ ok: false, error: result.error ?? "Sync failed." }, { status: 502 });
  }

  return NextResponse.json({ ok: result.ok, synced: result.synced, error: result.error ?? null, lastSyncedAt });
}
