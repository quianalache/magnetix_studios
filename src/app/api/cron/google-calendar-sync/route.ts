import "server-only";

import { NextResponse } from "next/server";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { verifyQStashSignature } from "@/lib/automations/qstash";
import {
  SyncTokenExpiredError,
  fetchCalendarEvents,
  refreshAccessToken,
  type GoogleCalendarEventDto,
} from "@/lib/google-calendar/client";
import type { GoogleCalendarConnection } from "@/types/google-calendar";

/**
 * Periodic pull-in sync for every connected Google Calendar. QStash
 * recurring schedule (see `lib/qstash/register-schedules.ts`) plus a
 * best-effort immediate trigger right after a new connection is made (see
 * the callback route). Security: Upstash-Signature verify, same pattern as
 * `events/payment/expire-step`.
 *
 * For each connection: refresh the access token if it's near expiry, fetch
 * changed events (incremental via `syncToken` once one exists, otherwise a
 * fresh [-7d, +60d] window), upsert into `externalCalendarEvents` with a
 * deterministic doc id so re-runs are idempotent, and persist the new
 * `nextSyncToken` + `lastSyncedAt`. A stale (410) syncToken triggers one
 * full re-fetch in the same run.
 */

const WINDOW_BACK_DAYS = 7;
const WINDOW_FORWARD_DAYS = 60;
const REFRESH_MARGIN_MS = 5 * 60 * 1000;

function toIsoDate(googleDate: { dateTime?: string; date?: string }): {
  value: Date | null;
  allDay: boolean;
} {
  if (googleDate.dateTime) return { value: new Date(googleDate.dateTime), allDay: false };
  if (googleDate.date) return { value: new Date(`${googleDate.date}T00:00:00`), allDay: true };
  return { value: null, allDay: false };
}

async function syncOneConnection(
  connId: string,
  conn: GoogleCalendarConnection,
): Promise<{ ok: boolean; synced: number }> {
  const db = getAdminDb();
  const connRef = db.doc(`googleCalendarConnections/${connId}`);

  // Refresh the access token if it's near/at expiry.
  let accessToken = conn.accessToken;
  const expiresAtMs =
    conn.expiresAt instanceof Timestamp ? conn.expiresAt.toMillis() : 0;
  if (expiresAtMs - Date.now() < REFRESH_MARGIN_MS) {
    try {
      const refreshed = await refreshAccessToken(conn.refreshToken);
      accessToken = refreshed.accessToken;
      await connRef.update({
        accessToken,
        expiresAt: Timestamp.fromMillis(Date.now() + refreshed.expiresInSec * 1000),
      });
    } catch (err) {
      console.warn(`[google-calendar-sync] token refresh failed conn=${connId}`, err);
      return { ok: false, synced: 0 };
    }
  }

  let result;
  try {
    result = await fetchCalendarEvents(accessToken, { syncToken: conn.syncToken });
  } catch (err) {
    if (err instanceof SyncTokenExpiredError) {
      const now = new Date();
      const timeMin = new Date(now.getTime() - WINDOW_BACK_DAYS * 86_400_000).toISOString();
      const timeMax = new Date(now.getTime() + WINDOW_FORWARD_DAYS * 86_400_000).toISOString();
      try {
        result = await fetchCalendarEvents(accessToken, { timeMin, timeMax });
      } catch (err2) {
        console.warn(`[google-calendar-sync] full re-fetch failed conn=${connId}`, err2);
        return { ok: false, synced: 0 };
      }
    } else {
      console.warn(`[google-calendar-sync] fetch failed conn=${connId}`, err);
      return { ok: false, synced: 0 };
    }
  }

  const batch = db.batch();
  let count = 0;
  for (const item of result.events as GoogleCalendarEventDto[]) {
    const docId = `${conn.subAccountId}_${conn.uid}_${item.id}`;
    const ref = db.collection("externalCalendarEvents").doc(docId);
    if (item.status === "cancelled") {
      // Google's incremental sync surfaces deletions this way — remove our
      // mirror rather than keep a cancelled row around.
      batch.delete(ref);
      count++;
      continue;
    }
    const start = toIsoDate(item.start);
    const end = toIsoDate(item.end);
    if (!start.value) continue;
    batch.set(ref, {
      subAccountId: conn.subAccountId,
      agencyId: conn.agencyId,
      uid: conn.uid,
      googleEventId: item.id,
      title: item.summary || "(No title)",
      startAt: Timestamp.fromDate(start.value),
      endAt: end.value ? Timestamp.fromDate(end.value) : Timestamp.fromDate(start.value),
      allDay: start.allDay,
      location: item.location ?? null,
      htmlLink: item.htmlLink ?? null,
      status: item.status,
      updatedAt: FieldValue.serverTimestamp(),
    });
    count++;
  }
  if (count > 0) await batch.commit();

  await connRef.update({
    syncToken: result.nextSyncToken ?? conn.syncToken ?? null,
    lastSyncedAt: FieldValue.serverTimestamp(),
  });

  return { ok: true, synced: count };
}

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
