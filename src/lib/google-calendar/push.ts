import "server-only";

import {
  createCalendarEvent,
  deleteCalendarEvent,
  updateCalendarEvent,
  type CalendarEventInput,
} from "@/lib/google-calendar/client";
import { getValidAccessToken } from "@/lib/google-calendar/connection";

/**
 * Push-on-write mirror of a CRM event onto the creating member's own
 * connected Google Calendar — the reverse direction of the pull-in sync
 * cron. Matches MomentumOS: no per-event opt-in, if the member has a
 * connection it just happens. Every function here is best-effort and
 * NEVER throws — a member without a connection, a revoked token, or a
 * transient Google error should never block the underlying CRM write,
 * it should just mean nothing gets pushed this time.
 */

export interface PushEventInput {
  title: string;
  startAt: Date;
  endAt: Date;
  location: string;
  notes: string;
  meetingUrl?: string | null;
}

function toCalendarEventInput(input: PushEventInput): CalendarEventInput {
  const description = [input.notes, input.meetingUrl ? `Meeting link: ${input.meetingUrl}` : null]
    .filter(Boolean)
    .join("\n\n");
  return {
    summary: input.title,
    description: description || null,
    location: input.location || null,
    start: input.startAt.toISOString(),
    end: input.endAt.toISOString(),
  };
}

/** Create the event on `uid`'s connected calendar. Returns the Google event id, or null if there's no connection or the push failed. */
export async function pushEventCreate(
  subAccountId: string,
  uid: string,
  input: PushEventInput,
): Promise<string | null> {
  const accessToken = await getValidAccessToken(subAccountId, uid);
  if (!accessToken) return null;
  try {
    const created = await createCalendarEvent(
      accessToken,
      toCalendarEventInput(input),
    );
    return created.id;
  } catch (err) {
    console.warn(
      `[google-calendar/push] create failed sa=${subAccountId} uid=${uid}`,
      err,
    );
    return null;
  }
}

/** Update a previously-pushed event. No-op (silently) if there's no connection or the push failed. */
export async function pushEventUpdate(
  subAccountId: string,
  uid: string,
  googleEventId: string,
  input: PushEventInput,
): Promise<void> {
  const accessToken = await getValidAccessToken(subAccountId, uid);
  if (!accessToken) return;
  try {
    await updateCalendarEvent(accessToken, googleEventId, toCalendarEventInput(input));
  } catch (err) {
    console.warn(
      `[google-calendar/push] update failed sa=${subAccountId} uid=${uid} event=${googleEventId}`,
      err,
    );
  }
}

/** Delete a previously-pushed event. No-op (silently) if there's no connection or the push failed. */
export async function pushEventDelete(
  subAccountId: string,
  uid: string,
  googleEventId: string,
): Promise<void> {
  const accessToken = await getValidAccessToken(subAccountId, uid);
  if (!accessToken) return;
  try {
    await deleteCalendarEvent(accessToken, googleEventId);
  } catch (err) {
    console.warn(
      `[google-calendar/push] delete failed sa=${subAccountId} uid=${uid} event=${googleEventId}`,
      err,
    );
  }
}
