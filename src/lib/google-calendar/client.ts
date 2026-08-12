import "server-only";

import crypto from "node:crypto";

/**
 * Google Calendar integration wrapper — two-way sync of a connected member's
 * events (pull-in from Google + push CRM-created events out to Google), to
 * match MomentumOS's calendar functionality. Mirrors the shape of
 * `lib/comms/meta.ts`: pure
 * `fetch` helpers, no Firestore writes, no `googleapis` SDK dependency (this
 * codebase has none installed; the Meta integration already proved the
 * plain-fetch style works fine for OAuth + REST). Everything here is INERT
 * unless the deployment has Google OAuth credentials configured
 * (`GOOGLE_CALENDAR_CLIENT_ID` + `GOOGLE_CALENDAR_CLIENT_SECRET`) AND the
 * sub-account's agency gate (`googleCalendarSyncEnabledByAgency`) is on.
 */

const OAUTH_AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";
const OAUTH_REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo";
const CALENDAR_LIST_URL = "https://www.googleapis.com/calendar/v3/users/me/calendarList";

/** Base events URL for one specific calendar. `calendarId` is Google's own id (e.g. "primary", or a real address like "abc@group.calendar.google.com") — always used raw, never assumed to be "primary". */
function calendarEventsUrl(calendarId: string): string {
  return `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`;
}

/**
 * Matches MomentumOS's scope set exactly — full calendar + events
 * read/write, plus email for the connected-account display. Exported so
 * the callback route can persist the actual granted scope on the
 * connection doc instead of a hand-typed copy that can drift out of sync.
 */
export const SCOPE =
  "https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/calendar.events email";

/** True when the deployment has Google OAuth app credentials. Gate every connect/sync on this. */
export function googleCalendarAppConfigured(): boolean {
  return (
    !!process.env.GOOGLE_CALENDAR_CLIENT_ID &&
    !!process.env.GOOGLE_CALENDAR_CLIENT_SECRET
  );
}

/**
 * The ONE OAuth redirect URI for the whole deployment — Google validates it
 * with an exact match against the app's registered list, so it must be a
 * single fixed value, not per-sub-account. The connecting sub-account + uid
 * travel in the signed `state` instead (same reasoning as Meta's redirect).
 * Anchored to NEXT_PUBLIC_APP_URL so the value is stable and byte-identical
 * between the authorize step and the token exchange.
 */
export function googleCalendarRedirectUri(): string | null {
  const base = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  if (!base) return null;
  return `${base}/api/google-calendar/callback`;
}

export function buildGoogleCalendarOAuthUrl(opts: {
  redirectUri: string;
  state: string;
}): string {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CALENDAR_CLIENT_ID ?? "",
    redirect_uri: opts.redirectUri,
    state: opts.state,
    scope: SCOPE,
    response_type: "code",
    access_type: "offline",
    // Forces Google to re-issue a refresh token on every consent, not just
    // the first — otherwise a reconnect after revoking access silently
    // yields no refresh_token and sync breaks after the access token expires.
    prompt: "consent",
  });
  return `${OAUTH_AUTHORIZE_URL}?${params.toString()}`;
}

// ---------------------------------------------------------------------------
// CSRF state — HMAC-signed with the existing AUTOMATIONS_TOKEN_SECRET, same
// pattern as Meta's signMetaState/verifyMetaState. Carries subAccountId + the
// connecting member's uid (Google Calendar connections are per-member).
// ---------------------------------------------------------------------------

function stateSecret(): string {
  return process.env.AUTOMATIONS_TOKEN_SECRET ?? "";
}

export function signGoogleCalendarState(
  subAccountId: string,
  uid: string,
  nonce: string,
): string {
  const payload = `${subAccountId}.${uid}.${nonce}`;
  const sig = crypto
    .createHmac("sha256", stateSecret())
    .update(`gcalstate:${payload}`)
    .digest("hex");
  return `${payload}.${sig}`;
}

export function verifyGoogleCalendarState(
  state: string,
): { subAccountId: string; uid: string } | null {
  const parts = state.split(".");
  if (parts.length !== 4) return null;
  const [subAccountId, uid, nonce, sig] = parts;
  const expected = crypto
    .createHmac("sha256", stateSecret())
    .update(`gcalstate:${subAccountId}.${uid}.${nonce}`)
    .digest("hex");
  if (sig.length !== expected.length) return null;
  try {
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
      return null;
    }
  } catch {
    return null;
  }
  return { subAccountId, uid };
}

// ---------------------------------------------------------------------------
// Token exchange / refresh / revoke
// ---------------------------------------------------------------------------

export interface GoogleTokens {
  accessToken: string;
  /** Only present on the FIRST consent (or every consent, thanks to `prompt=consent`). */
  refreshToken: string | null;
  /** Seconds until the access token expires, per Google's response. */
  expiresInSec: number;
}

interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

/** Exchange the OAuth `code` for access + refresh tokens. */
export async function exchangeCodeForTokens(
  code: string,
  redirectUri: string,
): Promise<GoogleTokens> {
  const res = await fetch(OAUTH_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CALENDAR_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_CALENDAR_CLIENT_SECRET ?? "",
      redirect_uri: redirectUri,
      code,
      grant_type: "authorization_code",
    }).toString(),
  });
  const data = (await res.json().catch(() => ({}))) as TokenResponse;
  if (!res.ok || !data.access_token) {
    throw new Error(
      data.error_description ?? `Google token exchange failed (${res.status})`,
    );
  }
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? null,
    expiresInSec: data.expires_in ?? 3600,
  };
}

/** Exchange a stored refresh token for a fresh access token. */
export async function refreshAccessToken(
  refreshToken: string,
): Promise<{ accessToken: string; expiresInSec: number }> {
  const res = await fetch(OAUTH_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CALENDAR_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_CALENDAR_CLIENT_SECRET ?? "",
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }).toString(),
  });
  const data = (await res.json().catch(() => ({}))) as TokenResponse;
  if (!res.ok || !data.access_token) {
    throw new Error(
      data.error_description ?? `Google token refresh failed (${res.status})`,
    );
  }
  return { accessToken: data.access_token, expiresInSec: data.expires_in ?? 3600 };
}

/** Best-effort revoke on disconnect. Google returns 200 even for an already-invalid token. */
export async function revokeGoogleToken(token: string): Promise<void> {
  await fetch(OAUTH_REVOKE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token }).toString(),
  }).catch(() => {
    // Best-effort — the connection doc is deleted regardless.
  });
}

interface UserInfoResponse {
  email?: string;
}

/** Fetch the connecting Google account's email, shown in the Settings card. */
export async function fetchGoogleAccountEmail(
  accessToken: string,
): Promise<string | null> {
  try {
    const res = await fetch(USERINFO_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as UserInfoResponse;
    return data.email ?? null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Calendar list — which calendars this Google account actually has, so a
// member can pick which one(s) pull-in sync should read from (2026-08-12,
// multi-calendar selection). Same `calendar` scope already granted at
// connect time covers this endpoint too — no re-consent needed for
// existing connections.
// ---------------------------------------------------------------------------

export interface GoogleCalendarListEntry {
  id: string;
  summary: string;
  primary?: boolean;
  /** Google's own display color for this calendar, if set — handy for the picker UI. */
  backgroundColor?: string;
}

/** The connected account's own list of calendars (owned, shared-with-them, subscribed). */
export async function fetchCalendarList(accessToken: string): Promise<GoogleCalendarListEntry[]> {
  const entries: GoogleCalendarListEntry[] = [];
  let pageToken: string | undefined;
  for (;;) {
    const params = new URLSearchParams({ maxResults: "250" });
    if (pageToken) params.set("pageToken", pageToken);
    const res = await fetch(`${CALENDAR_LIST_URL}?${params.toString()}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      throw new Error(`Google Calendar list fetch failed (${res.status})`);
    }
    const data = (await res.json()) as {
      items?: { id: string; summary?: string; primary?: boolean; backgroundColor?: string }[];
      nextPageToken?: string;
    };
    for (const item of data.items ?? []) {
      entries.push({
        id: item.id,
        summary: item.summary || item.id,
        primary: item.primary,
        backgroundColor: item.backgroundColor,
      });
    }
    if (!data.nextPageToken) break;
    pageToken = data.nextPageToken;
  }
  return entries;
}

// ---------------------------------------------------------------------------
// Calendar events
// ---------------------------------------------------------------------------

export interface GoogleCalendarEventDto {
  id: string;
  summary: string;
  start: { dateTime?: string; date?: string };
  end: { dateTime?: string; date?: string };
  location?: string;
  htmlLink?: string;
  status: "confirmed" | "tentative" | "cancelled";
}

export interface FetchEventsResult {
  events: GoogleCalendarEventDto[];
  /** Persist this for the next sync's `syncToken`. Undefined = token expired mid-page (rare). */
  nextSyncToken?: string;
}

/** Thrown when Google reports the stored syncToken is stale (410 GONE) — caller must re-fetch without one. */
export class SyncTokenExpiredError extends Error {
  constructor() {
    super("Google Calendar sync token expired — full re-sync required.");
    this.name = "SyncTokenExpiredError";
  }
}

/**
 * Fetch events from ONE specific calendar (`calendarId` — "primary", or any
 * other calendar id from `fetchCalendarList()`). With a `syncToken`, Google
 * returns only what changed since that calendar's last sync (including
 * deletions, surfaced as `status: "cancelled"`) — cheap, incremental.
 * Without one, fetches everything in `[timeMin, timeMax]` (used for that
 * calendar's first sync, or after a 410 forces a fresh start). Paginates via
 * `nextPageToken` until exhausted. Sync tokens are scoped per-calendar by
 * Google's own API — never reuse one calendar's token for another.
 */
export async function fetchCalendarEvents(
  accessToken: string,
  calendarId: string,
  opts: { syncToken?: string | null; timeMin?: string; timeMax?: string },
): Promise<FetchEventsResult> {
  const events: GoogleCalendarEventDto[] = [];
  let pageToken: string | undefined;
  let nextSyncToken: string | undefined;

  for (;;) {
    const params = new URLSearchParams({ maxResults: "250" });
    if (opts.syncToken) {
      params.set("syncToken", opts.syncToken);
    } else {
      if (opts.timeMin) params.set("timeMin", opts.timeMin);
      if (opts.timeMax) params.set("timeMax", opts.timeMax);
      params.set("singleEvents", "true");
    }
    if (pageToken) params.set("pageToken", pageToken);

    const res = await fetch(`${calendarEventsUrl(calendarId)}?${params.toString()}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (res.status === 410) {
      throw new SyncTokenExpiredError();
    }
    if (!res.ok) {
      throw new Error(`Google Calendar events fetch failed (${res.status})`);
    }
    const data = (await res.json()) as {
      items?: GoogleCalendarEventDto[];
      nextPageToken?: string;
      nextSyncToken?: string;
    };
    events.push(...(data.items ?? []));
    if (data.nextSyncToken) nextSyncToken = data.nextSyncToken;
    if (!data.nextPageToken) break;
    pageToken = data.nextPageToken;
  }

  return { events, nextSyncToken };
}

// ---------------------------------------------------------------------------
// Push — mirroring a CRM-created event onto the connected member's own
// primary Google Calendar (create/update/delete), matching MomentumOS.
// ---------------------------------------------------------------------------

export interface CalendarEventInput {
  summary: string;
  description?: string | null;
  location?: string | null;
  /** ISO 8601 with offset/zone, e.g. from `Date.toISOString()`. */
  start: string;
  end: string;
}

function toGoogleEventBody(input: CalendarEventInput) {
  return {
    summary: input.summary,
    description: input.description || undefined,
    location: input.location || undefined,
    start: { dateTime: input.start },
    end: { dateTime: input.end },
  };
}

/** Create an event on the connected member's primary Google Calendar. */
export async function createCalendarEvent(
  accessToken: string,
  input: CalendarEventInput,
): Promise<GoogleCalendarEventDto> {
  const res = await fetch(calendarEventsUrl("primary"), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(toGoogleEventBody(input)),
  });
  if (!res.ok) {
    throw new Error(`Google Calendar event create failed (${res.status})`);
  }
  return (await res.json()) as GoogleCalendarEventDto;
}

/** Update a previously-pushed event on the connected member's calendar. */
export async function updateCalendarEvent(
  accessToken: string,
  googleEventId: string,
  input: CalendarEventInput,
): Promise<GoogleCalendarEventDto> {
  const res = await fetch(
    `${calendarEventsUrl("primary")}/${encodeURIComponent(googleEventId)}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(toGoogleEventBody(input)),
    },
  );
  if (!res.ok) {
    throw new Error(`Google Calendar event update failed (${res.status})`);
  }
  return (await res.json()) as GoogleCalendarEventDto;
}

/** Delete a previously-pushed event. A 404/410 (already gone) is treated as success. */
export async function deleteCalendarEvent(
  accessToken: string,
  googleEventId: string,
): Promise<void> {
  const res = await fetch(
    `${calendarEventsUrl("primary")}/${encodeURIComponent(googleEventId)}`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  );
  if (!res.ok && res.status !== 404 && res.status !== 410) {
    throw new Error(`Google Calendar event delete failed (${res.status})`);
  }
}
