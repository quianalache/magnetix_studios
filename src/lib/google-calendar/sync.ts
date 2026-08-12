import "server-only";

import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { getValidAccessToken } from "@/lib/google-calendar/connection";
import {
  SyncTokenExpiredError,
  fetchCalendarEvents,
  type GoogleCalendarEventDto,
} from "@/lib/google-calendar/client";
import type { GoogleCalendarConnection } from "@/types/google-calendar";

/**
 * The actual pull-in sync logic — ONE implementation shared by the
 * recurring QStash cron (`/api/cron/google-calendar-sync`) and the
 * on-demand "Sync Now" route (`/api/sub-accounts/[id]/google-calendar/
 * sync-now`), so a manual sync can never drift from what the recurring
 * job does. Moved out of the cron route 2026-08-12 alongside multi-
 * calendar selection — previously lived inline there, single-calendar
 * ("primary") only.
 */

const WINDOW_BACK_DAYS = 7;
const WINDOW_FORWARD_DAYS = 60;

export const DEFAULT_SELECTED_CALENDAR_IDS = ["primary"];

function toIsoDate(googleDate: { dateTime?: string; date?: string }): {
  value: Date | null;
  allDay: boolean;
} {
  if (googleDate.dateTime) return { value: new Date(googleDate.dateTime), allDay: false };
  if (googleDate.date) return { value: new Date(`${googleDate.date}T00:00:00`), allDay: true };
  return { value: null, allDay: false };
}

/** externalCalendarEvents doc id for one (calendar, event) pair. "primary" keeps the pre-multi-calendar id shape unchanged — every event already synced under the old single-calendar scheme stays the same doc, so this never re-imports (or duplicates) a member's existing history. Any other calendar gets its id namespaced by calendarId, since Google's own event ids are only guaranteed unique within one calendar. */
function externalEventDocId(subAccountId: string, uid: string, calendarId: string, googleEventId: string): string {
  return calendarId === "primary"
    ? `${subAccountId}_${uid}_${googleEventId}`
    : `${subAccountId}_${uid}_${calendarId}_${googleEventId}`;
}

async function syncOneCalendar(
  db: FirebaseFirestore.Firestore,
  conn: GoogleCalendarConnection,
  accessToken: string,
  calendarId: string,
  storedToken: string | null,
): Promise<{ synced: number; nextToken: string | null }> {
  let result;
  try {
    result = await fetchCalendarEvents(accessToken, calendarId, { syncToken: storedToken });
  } catch (err) {
    if (err instanceof SyncTokenExpiredError) {
      const now = new Date();
      const timeMin = new Date(now.getTime() - WINDOW_BACK_DAYS * 86_400_000).toISOString();
      const timeMax = new Date(now.getTime() + WINDOW_FORWARD_DAYS * 86_400_000).toISOString();
      result = await fetchCalendarEvents(accessToken, calendarId, { timeMin, timeMax });
    } else {
      throw err;
    }
  }

  const batch = db.batch();
  let count = 0;
  for (const item of result.events as GoogleCalendarEventDto[]) {
    const docId = externalEventDocId(conn.subAccountId, conn.uid, calendarId, item.id);
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
      calendarId,
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

  return { synced: count, nextToken: result.nextSyncToken ?? storedToken ?? null };
}

/**
 * Sync every one of `conn`'s selected calendars (defaults to `["primary"]`
 * for connections made before multi-calendar selection shipped). Refreshes
 * the access token first if needed. Always updates `lastSyncedAt` on
 * success (even a 0-event run) so the UI's "last synced" reflects a real
 * completed attempt, not just a change.
 */
export async function syncOneConnection(
  connId: string,
  conn: GoogleCalendarConnection,
): Promise<{ ok: boolean; synced: number; error?: string }> {
  const db = getAdminDb();
  const connRef = db.doc(`googleCalendarConnections/${connId}`);

  const accessToken = await getValidAccessToken(conn.subAccountId, conn.uid);
  if (!accessToken) {
    return { ok: false, synced: 0, error: "No valid access token (connection revoked or refresh failed)." };
  }

  const calendarIds = conn.selectedCalendarIds?.length ? conn.selectedCalendarIds : DEFAULT_SELECTED_CALENDAR_IDS;
  const nextSyncTokens: Record<string, string | null> = { ...(conn.syncTokens ?? {}) };
  let total = 0;
  let lastError: string | undefined;

  for (const calendarId of calendarIds) {
    // Legacy fallback: an already-connected member's pre-multi-calendar
    // progress lived in the flat `syncToken` field — reuse it the first
    // time "primary" is synced under the new per-calendar scheme instead
    // of forcing a wasteful full re-fetch of everything already synced.
    const storedToken =
      nextSyncTokens[calendarId] ?? (calendarId === "primary" ? (conn.syncToken ?? null) : null);
    try {
      const { synced, nextToken } = await syncOneCalendar(db, conn, accessToken, calendarId, storedToken);
      nextSyncTokens[calendarId] = nextToken;
      total += synced;
    } catch (err) {
      const message = err instanceof Error ? err.message : "unknown error";
      console.warn(`[google-calendar-sync] calendar failed conn=${connId} calendar=${calendarId}`, err);
      lastError = message;
    }
  }

  await connRef.update({
    syncTokens: nextSyncTokens,
    lastSyncedAt: FieldValue.serverTimestamp(),
  });

  return { ok: !lastError, synced: total, error: lastError };
}
