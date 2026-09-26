import "server-only";

import { NextResponse } from "next/server";
import { requireDealRoute } from "@/lib/server/deal-route-guard";
import { dealNotesPath } from "@/lib/server/deal-feed-service";
import {
  ContactFeedError,
  createNoteAt,
  listNotesAt,
} from "@/lib/server/contact-feed-service";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Deal-specific notes (Deal Details, Multiple Pipelines 2026-09-25).
 * Stored at `deals/{id}/notes` — separate from Contact notes and from other
 * deals' notes; same record shape + authorship rules as Contact notes.
 *   GET  ?cursor= — one page, newest first.
 *   POST { content } — author is the authenticated caller.
 */
export async function GET(request: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const guard = await requireDealRoute(request, id);
  if (guard instanceof NextResponse) return guard;
  const page = await listNotesAt(dealNotesPath(id), {
    subAccountId: guard.deal.subAccountId,
    cursor: new URL(request.url).searchParams.get("cursor"),
    caller: { uid: guard.access.uid, isAdmin: guard.isAdmin },
  });
  return NextResponse.json(page);
}

export async function POST(request: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const guard = await requireDealRoute(request, id);
  if (guard instanceof NextResponse) return guard;
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  try {
    const noteId = await createNoteAt(dealNotesPath(id), {
      uid: guard.access.uid,
      content: body.content,
    });
    return NextResponse.json({ id: noteId }, { status: 201 });
  } catch (err) {
    if (err instanceof ContactFeedError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
