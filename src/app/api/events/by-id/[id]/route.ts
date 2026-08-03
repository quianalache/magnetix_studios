import "server-only";

import { NextResponse } from "next/server";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { territoryForContact } from "@/lib/server/events-service";
import { pushEventCreate, pushEventDelete, pushEventUpdate } from "@/lib/google-calendar/push";
import { GLOBAL_TERRITORY_ID } from "@/types";
import type { CalendarEvent } from "@/types/events";

/**
 * Manual-calendar edit + delete. Moved server-side (was a direct client
 * Firestore write) so a Google Calendar push can happen alongside the
 * Firestore write — pushing requires the connection's access token, which
 * only the server can touch. Booking-page-sourced events keep their
 * existing dedicated routes (mark-paid, mark-status, assign) for lifecycle
 * changes; this route only covers the plain edit-dialog fields.
 */

interface PatchBody {
  title?: string;
  startAt?: string;
  endAt?: string;
  contactId?: string | null;
  location?: string;
  notes?: string;
  meetingUrl?: string | null;
}

function str(v: unknown, max = 5000): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

async function loadEvent(eventId: string) {
  const db = getAdminDb();
  const ref = db.collection("events").doc(eventId);
  const snap = await ref.get();
  if (!snap.exists) return null;
  return { ref, event: { id: snap.id, ...(snap.data() as Omit<CalendarEvent, "id">) } };
}

export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: eventId } = await ctx.params;

  let body: PatchBody;
  try {
    body = (await request.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const loaded = await loadEvent(eventId);
  if (!loaded) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }
  const { ref, event } = loaded;

  const access = await requireSubAccountMember(request, event.subAccountId);
  if (access instanceof NextResponse) return access;

  const patch: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
  if (body.title !== undefined) patch.title = str(body.title, 200);
  if (body.startAt !== undefined) {
    const d = new Date(body.startAt);
    if (Number.isNaN(d.getTime())) {
      return NextResponse.json({ error: "Invalid startAt" }, { status: 400 });
    }
    patch.startAt = d;
  }
  if (body.endAt !== undefined) {
    const d = new Date(body.endAt);
    if (Number.isNaN(d.getTime())) {
      return NextResponse.json({ error: "Invalid endAt" }, { status: 400 });
    }
    patch.endAt = d;
  }
  if (body.contactId !== undefined) {
    patch.contactId = body.contactId;
    patch.territoryId = (await territoryForContact(body.contactId)) || GLOBAL_TERRITORY_ID;
  }
  if (body.location !== undefined) patch.location = str(body.location);
  if (body.notes !== undefined) patch.notes = str(body.notes);
  if (body.meetingUrl !== undefined) patch.meetingUrl = body.meetingUrl;

  try {
    await ref.update(patch);
  } catch (err) {
    console.error("[events/by-id PATCH] update failed", err);
    return NextResponse.json({ error: "Couldn't update event." }, { status: 500 });
  }

  // Best-effort Google push: mirror onto the ORIGINAL creator's calendar
  // (not necessarily whoever is editing) — a push already exists per
  // creator, so edits by a teammate still land on the right calendar.
  const pushInput = {
    title: (patch.title as string | undefined) ?? event.title,
    startAt: (patch.startAt as Date | undefined) ?? event.startAt,
    endAt: (patch.endAt as Date | undefined) ?? event.endAt,
    location: (patch.location as string | undefined) ?? event.location,
    notes: (patch.notes as string | undefined) ?? event.notes,
    meetingUrl:
      body.meetingUrl !== undefined ? body.meetingUrl : (event.meetingUrl ?? null),
  };
  const startAt = toDate(pushInput.startAt);
  const endAt = toDate(pushInput.endAt);
  if (startAt && endAt) {
    if (event.googleEventId) {
      await pushEventUpdate(event.subAccountId, event.createdByUid, event.googleEventId, {
        ...pushInput,
        startAt,
        endAt,
      });
    } else {
      const googleEventId = await pushEventCreate(event.subAccountId, event.createdByUid, {
        ...pushInput,
        startAt,
        endAt,
      });
      if (googleEventId) await ref.update({ googleEventId });
    }
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: eventId } = await ctx.params;

  const loaded = await loadEvent(eventId);
  if (!loaded) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }
  const { ref, event } = loaded;

  const access = await requireSubAccountMember(request, event.subAccountId);
  if (access instanceof NextResponse) return access;

  try {
    await ref.delete();
  } catch (err) {
    console.error("[events/by-id DELETE] delete failed", err);
    return NextResponse.json({ error: "Couldn't delete event." }, { status: 500 });
  }

  if (event.googleEventId) {
    await pushEventDelete(event.subAccountId, event.createdByUid, event.googleEventId);
  }

  return NextResponse.json({ ok: true });
}

function toDate(v: unknown): Date | null {
  if (v instanceof Date) return v;
  if (v instanceof Timestamp) return v.toDate();
  const maybe = v as { toDate?: () => Date } | null;
  if (maybe && typeof maybe.toDate === "function") return maybe.toDate();
  return null;
}
