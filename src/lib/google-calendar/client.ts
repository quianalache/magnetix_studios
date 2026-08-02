import "server-only";

import crypto from "node:crypto";

/**
 * Google Calendar integration wrapper — Phase 1, read-only pull-in of a
 * connected member's events. Mirrors the shape of `lib/comms/meta.ts`: pure
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
const CALENDAR_EVENTS_URL =
  "https://www.googleapis.com/calendar/v3/calendars/primary/events";

/** Read-only, events-only — least privilege for a pull-in-only v1. */
const SCOPE = "https://www.googleapis.com/auth/calendar.events.readonly";

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
 * Fetch events from the connected calendar's primary calendar. With a
 * `syncToken`, Google returns only what changed since the last sync
 * (including deletions, surfaced as `status: "cancelled"`) — cheap,
 * incremental. Without one, fetches everything in `[timeMin, timeMax]`
 * (used for the first sync, or after a 410 forces a fresh start). Paginates
 * via `nextPageToken` until exhausted.
 */
export async function fetchCalendarEvents(
  accessToken: string,
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

    const res = await fetch(`${CALENDAR_EVENTS_URL}?${params.toString()}`, {
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
