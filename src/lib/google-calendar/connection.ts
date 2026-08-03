import "server-only";

import { Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { refreshAccessToken } from "@/lib/google-calendar/client";
import type { GoogleCalendarConnection } from "@/types/google-calendar";

/**
 * Shared connection lookup + token refresh, used by both the pull-in sync
 * cron and the push-on-write path (create/update/delete) so the two don't
 * duplicate the refresh-margin logic and drift apart.
 */

const REFRESH_MARGIN_MS = 5 * 60 * 1000;

export function connectionId(subAccountId: string, uid: string): string {
  return `${subAccountId}_${uid}`;
}

/**
 * Returns a valid access token for this member's Google Calendar
 * connection, refreshing it first if it's near/at expiry. Returns `null`
 * when the member has no connection, or the refresh itself fails (network
 * blip, revoked access) — callers should treat that as "nothing to push
 * to" rather than an error, since Google Calendar push is always
 * best-effort.
 */
export async function getValidAccessToken(
  subAccountId: string,
  uid: string,
): Promise<string | null> {
  const db = getAdminDb();
  const connRef = db.doc(
    `googleCalendarConnections/${connectionId(subAccountId, uid)}`,
  );
  const snap = await connRef.get();
  if (!snap.exists) return null;
  const conn = snap.data() as GoogleCalendarConnection;

  const expiresAtMs =
    conn.expiresAt instanceof Timestamp ? conn.expiresAt.toMillis() : 0;
  if (expiresAtMs - Date.now() >= REFRESH_MARGIN_MS) {
    return conn.accessToken;
  }

  try {
    const refreshed = await refreshAccessToken(conn.refreshToken);
    await connRef.update({
      accessToken: refreshed.accessToken,
      expiresAt: Timestamp.fromMillis(Date.now() + refreshed.expiresInSec * 1000),
    });
    return refreshed.accessToken;
  } catch (err) {
    console.warn(
      `[google-calendar/connection] token refresh failed sa=${subAccountId} uid=${uid}`,
      err,
    );
    return null;
  }
}
