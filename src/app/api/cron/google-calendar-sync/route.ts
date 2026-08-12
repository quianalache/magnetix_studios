import "server-only";

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { verifyQStashSignature } from "@/lib/automations/qstash";
import { syncOneConnection } from "@/lib/google-calendar/sync";
import type { GoogleCalendarConnection } from "@/types/google-calendar";

/**
 * Periodic pull-in sync for every connected Google Calendar. QStash
 * recurring schedule (see `lib/qstash/register-schedules.ts`) plus a
 * best-effort immediate trigger right after a new connection is made (see
 * the callback route), and an on-demand "Sync Now" route a member can hit
 * directly (`/api/sub-accounts/[id]/google-calendar/sync-now`). Security:
 * Upstash-Signature verify, same pattern as `events/payment/expire-step`.
 *
 * The actual per-connection sync logic (now multi-calendar aware, see
 * 2026-08-12) lives in `lib/google-calendar/sync.ts` — shared with the
 * on-demand route so there's exactly one sync implementation, not two.
 */
export async function POST(request: Request) {
  const signature = request.headers.get("Upstash-Signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 401 });
  }
  const rawBody = await request.text();
  const ok = await verifyQStashSignature(signature, rawBody);
  if (!ok) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const db = getAdminDb();
  const snap = await db.collection("googleCalendarConnections").get();
  const results: Array<{ id: string; ok: boolean; synced: number }> = [];
  for (const doc of snap.docs) {
    const conn = doc.data() as GoogleCalendarConnection;
    const r = await syncOneConnection(doc.id, conn);
    results.push({ id: doc.id, ...r });
  }

  return NextResponse.json({ ok: true, connections: results.length, results });
}
