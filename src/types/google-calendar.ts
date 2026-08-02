import type { Timestamp, FieldValue } from "firebase/firestore";

/**
 * Google Calendar two-way sync (Phase 1: read-only pull-in). Per-member, not
 * sub-account-wide — a Google Calendar is inherently personal, so each team
 * member connects their own account. Lives at
 * `googleCalendarConnections/{subAccountId}_{uid}`. Entirely server-only
 * (Firestore rules deny all client read/write) — the UI reads a small
 * `{connected, googleAccountEmail, lastSyncedAt}` projection via
 * `GET /api/sub-accounts/[id]/google-calendar/status` instead of this doc
 * directly. Tokens are stored plaintext, same convention as
 * `MetaConfig.pageAccessToken` — see the Google Calendar sync plan for why.
 */
export interface GoogleCalendarConnection {
  subAccountId: string;
  agencyId: string;
  /** The CRM member who connected — this connection is theirs alone. */
  uid: string;
  googleAccountEmail: string;
  accessToken: string;
  refreshToken: string;
  /** Access token expiry. Refreshed by `getValidAccessToken()` when close. */
  expiresAt: Timestamp | FieldValue | null;
  scope: string;
  /**
   * Google Calendar incremental sync token from the last successful
   * `events.list` call. Null until the first sync completes, or after a 410
   * GONE response forces a full re-fetch.
   */
  syncToken: string | null;
  connectedAt: Timestamp | FieldValue | null;
  lastSyncedAt: Timestamp | FieldValue | null;
}

/**
 * One event pulled in from a connected Google Calendar. Deliberately
 * separate from the CRM's own `events` collection (see the sync plan) —
 * never feeds availability calculations, never echoes back out through the
 * outbound `.ics` feed. Read-only in the CRM; field names mirror Google's
 * own Calendar API shape (`summary`→`title`, `start`/`end`, `htmlLink`) so
 * mapping stays a straight passthrough.
 */
export interface ExternalCalendarEvent {
  id: string;
  subAccountId: string;
  agencyId: string;
  /** Whose connection this came from — only that member sees it on the calendar. */
  uid: string;
  googleEventId: string;
  title: string;
  startAt: Timestamp | FieldValue | null;
  endAt: Timestamp | FieldValue | null;
  allDay: boolean;
  location: string | null;
  /** Deep link back to the event in Google Calendar — the CRM never edits it. */
  htmlLink: string | null;
  status: "confirmed" | "tentative" | "cancelled";
  updatedAt: Timestamp | FieldValue | null;
}
