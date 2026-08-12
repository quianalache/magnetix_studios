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
   * @deprecated Legacy single-calendar sync token, from before multi-
   * calendar selection (2026-08-12) — kept only so an already-connected
   * member's existing "primary" progress carries forward instead of
   * triggering a wasteful full re-fetch. New code reads/writes
   * `syncTokens.primary` instead; this is treated as that field's
   * fallback the first time a connection is synced under the new scheme.
   */
  syncToken: string | null;
  /**
   * Per-calendar incremental sync token, keyed by Google calendar id —
   * added 2026-08-12 alongside multi-calendar selection. Each selected
   * calendar has its own token because Google scopes `syncToken` to one
   * calendar; reusing one calendar's token for another is invalid.
   */
  syncTokens?: Record<string, string | null>;
  /**
   * Which of this member's Google calendars pull-in sync reads from —
   * added 2026-08-12. Defaults to `["primary"]` when absent (every
   * connection made before this shipped), matching the sync's original,
   * only-ever behavior.
   */
  selectedCalendarIds?: string[];
  connectedAt: Timestamp | FieldValue | null;
  lastSyncedAt: Timestamp | FieldValue | null;
}

/** One calendar on the connected Google account, as offered by the calendar-selection picker. */
export interface GoogleCalendarListEntry {
  id: string;
  summary: string;
  primary?: boolean;
  backgroundColor?: string;
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
  /** Which of the member's selected Google calendars this came from — added 2026-08-12 (multi-calendar selection). Absent on events synced before this shipped (all from "primary"; backfilled — see the Build Log). */
  calendarId?: string;
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
