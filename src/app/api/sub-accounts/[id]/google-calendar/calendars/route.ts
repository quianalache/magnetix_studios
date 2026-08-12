import "server-only";

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { getValidAccessToken, connectionId } from "@/lib/google-calendar/connection";
import { fetchCalendarList } from "@/lib/google-calendar/client";
import { DEFAULT_SELECTED_CALENDAR_IDS } from "@/lib/google-calendar/sync";
import type { GoogleCalendarConnection, GoogleCalendarListEntry } from "@/types/google-calendar";

/**
 * Google's two calendar APIs disagree on what a connected account's own
 * calendar is called: `events.list` accepts (and this app has always
 * used) the literal alias `"primary"`, but `calendarList.list` never
 * returns that string — it returns the calendar's real id (the account's
 * own email address), flagged with `primary: true`. Internally this app
 * keeps using the literal `"primary"` token everywhere else (storage,
 * `DEFAULT_SELECTED_CALENDAR_IDS`, the sync-token migration fallback in
 * lib/google-calendar/sync.ts) — these two helpers translate at the one
 * boundary that actually talks to `calendarList`, so callers on both
 * sides of this route never have to think about the mismatch.
 */
function realPrimaryId(calendars: GoogleCalendarListEntry[]): string | null {
  return calendars.find((c) => c.primary)?.id ?? null;
}

/** For display: swap the stored literal "primary" for the account's real primary id, so it matches an actual entry in `calendars` and a checkbox can find it. */
function toDisplayIds(ids: string[], calendars: GoogleCalendarListEntry[]): string[] {
  const primaryId = realPrimaryId(calendars);
  if (!primaryId) return ids;
  return ids.map((cid) => (cid === "primary" ? primaryId : cid));
}

/** For storage: swap the account's real primary id back to the literal "primary" token, so everything downstream (sync, defaults, migration) keeps working unchanged. */
function toStorageIds(ids: string[], calendars: GoogleCalendarListEntry[]): string[] {
  const primaryId = realPrimaryId(calendars);
  if (!primaryId) return ids;
  return ids.map((cid) => (cid === primaryId ? "primary" : cid));
}

/**
 * The CALLER's own Google Calendar list + which one(s) are currently
 * selected to pull into Magnetix — 2026-08-12, multi-calendar selection.
 * Same personal-connection-only model as connect/disconnect/status: a
 * member only ever sees/manages their own connection.
 *
 *   GET /api/sub-accounts/[id]/google-calendar/calendars
 *   PUT /api/sub-accounts/[id]/google-calendar/calendars   { selectedCalendarIds: string[] }
 */
export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const access = await requireSubAccountMember(request, id);
  if (access instanceof NextResponse) return access;

  const connId = connectionId(id, access.uid);
  const snap = await getAdminDb().doc(`googleCalendarConnections/${connId}`).get();
  if (!snap.exists) {
    return NextResponse.json({ error: "Not connected" }, { status: 404 });
  }
  const conn = snap.data() as GoogleCalendarConnection;

  const accessToken = await getValidAccessToken(id, access.uid);
  if (!accessToken) {
    return NextResponse.json(
      { error: "Couldn't reach Google — the connection may need to be reconnected." },
      { status: 502 },
    );
  }

  try {
    const calendars = await fetchCalendarList(accessToken);
    const stored = conn.selectedCalendarIds?.length ? conn.selectedCalendarIds : DEFAULT_SELECTED_CALENDAR_IDS;
    return NextResponse.json({
      ok: true,
      calendars,
      selectedCalendarIds: toDisplayIds(stored, calendars),
    });
  } catch (err) {
    console.warn(`[google-calendar/calendars] list failed sa=${id} uid=${access.uid}`, err);
    return NextResponse.json({ error: "Couldn't load your Google calendars. Try again." }, { status: 502 });
  }
}

export async function PUT(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const access = await requireSubAccountMember(request, id);
  if (access instanceof NextResponse) return access;

  const body = await request.json().catch(() => null);
  const selectedCalendarIds: unknown = body?.selectedCalendarIds;
  if (
    !Array.isArray(selectedCalendarIds) ||
    selectedCalendarIds.length === 0 ||
    !selectedCalendarIds.every((v) => typeof v === "string" && v.length > 0)
  ) {
    return NextResponse.json(
      { error: "selectedCalendarIds must be a non-empty array of calendar ids." },
      { status: 400 },
    );
  }

  const db = getAdminDb();
  const connId = connectionId(id, access.uid);
  const connRef = db.doc(`googleCalendarConnections/${connId}`);
  const snap = await connRef.get();
  if (!snap.exists) {
    return NextResponse.json({ error: "Not connected" }, { status: 404 });
  }
  const conn = snap.data() as GoogleCalendarConnection;

  // Validate every requested id is actually one of this account's real
  // calendars — never trust a client-supplied calendar id blind.
  const accessToken = await getValidAccessToken(id, access.uid);
  if (!accessToken) {
    return NextResponse.json(
      { error: "Couldn't reach Google — the connection may need to be reconnected." },
      { status: 502 },
    );
  }
  let realCalendars;
  try {
    realCalendars = await fetchCalendarList(accessToken);
  } catch {
    return NextResponse.json({ error: "Couldn't verify your calendars. Try again." }, { status: 502 });
  }
  const realIds = new Set(realCalendars.map((c) => c.id));
  const invalid = selectedCalendarIds.filter((cid) => !realIds.has(cid));
  if (invalid.length > 0) {
    return NextResponse.json({ error: `Unknown calendar id(s): ${invalid.join(", ")}` }, { status: 400 });
  }

  // Normalize to storage space ("primary" token, not the real email-id)
  // before diffing/persisting — see the doc comment on toStorageIds above.
  const storageIds = [...new Set(toStorageIds(selectedCalendarIds, realCalendars))];

  const previouslySelected = new Set(
    conn.selectedCalendarIds?.length ? conn.selectedCalendarIds : DEFAULT_SELECTED_CALENDAR_IDS,
  );
  const nowSelected = new Set(storageIds);
  const removed = [...previouslySelected].filter((cid) => !nowSelected.has(cid));

  // Deliberate: a deselected calendar's previously-imported events are
  // removed (not left as stale ghosts), and its sync token is dropped so a
  // future re-selection starts a clean full re-fetch instead of risking a
  // stale/410 token — see lib/google-calendar/sync.ts's doc comment on
  // per-calendar tokens.
  if (removed.length > 0) {
    const batch = db.batch();
    for (const cid of removed) {
      const eventsSnap = await db
        .collection("externalCalendarEvents")
        .where("subAccountId", "==", id)
        .where("uid", "==", access.uid)
        .where("calendarId", "==", cid)
        .get();
      for (const doc of eventsSnap.docs) batch.delete(doc.ref);
    }
    await batch.commit();
  }

  const nextSyncTokens = { ...(conn.syncTokens ?? {}) };
  for (const cid of removed) delete nextSyncTokens[cid];

  await connRef.update({
    selectedCalendarIds: storageIds,
    syncTokens: nextSyncTokens,
  });

  return NextResponse.json({
    ok: true,
    selectedCalendarIds: toDisplayIds(storageIds, realCalendars),
    removedEventsFor: removed,
  });
}
