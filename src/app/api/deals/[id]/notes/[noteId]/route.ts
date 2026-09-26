import "server-only";

import { NextResponse } from "next/server";
import { requireDealRoute } from "@/lib/server/deal-route-guard";
import { dealNotesPath } from "@/lib/server/deal-feed-service";
import {
  ContactFeedError,
  deleteNoteAt,
  updateNoteAt,
} from "@/lib/server/contact-feed-service";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string; noteId: string }> };

const NOTE_ID_RE = /^[A-Za-z0-9_-]{1,128}$/;

/** PATCH { content } — author only. DELETE — author or admin. */
export async function PATCH(request: Request, ctx: Ctx) {
  const { id, noteId } = await ctx.params;
  if (!NOTE_ID_RE.test(noteId)) {
    return NextResponse.json({ error: "Note not found." }, { status: 404 });
  }
  const guard = await requireDealRoute(request, id);
  if (guard instanceof NextResponse) return guard;
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  try {
    await updateNoteAt(dealNotesPath(id), {
      noteId,
      uid: guard.access.uid,
      content: body.content,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof ContactFeedError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}

export async function DELETE(request: Request, ctx: Ctx) {
  const { id, noteId } = await ctx.params;
  if (!NOTE_ID_RE.test(noteId)) {
    return NextResponse.json({ error: "Note not found." }, { status: 404 });
  }
  const guard = await requireDealRoute(request, id);
  if (guard instanceof NextResponse) return guard;
  try {
    await deleteNoteAt(dealNotesPath(id), {
      noteId,
      caller: { uid: guard.access.uid, isAdmin: guard.isAdmin },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof ContactFeedError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
