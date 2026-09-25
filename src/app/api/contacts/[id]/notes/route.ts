import "server-only";

import { NextResponse } from "next/server";
import { requireContactRoute } from "@/lib/server/contact-route-guard";
import {
  ContactFeedError,
  createContactNote,
  listContactNotes,
} from "@/lib/server/contact-feed-service";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Contact notes (Contacts redesign, 2026-09-25).
 *   GET  ?cursor= — one page, newest first, with resolved author names.
 *   POST { content } — create; the author is the authenticated caller.
 * Any active member with access to the contact (territory-scoped).
 */
export async function GET(request: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const guard = await requireContactRoute(request, id);
  if (guard instanceof NextResponse) return guard;
  const cursor = new URL(request.url).searchParams.get("cursor");
  const page = await listContactNotes({
    subAccountId: guard.contact.subAccountId,
    contactId: id,
    cursor,
    caller: { uid: guard.access.uid, isAdmin: guard.isAdmin },
  });
  return NextResponse.json(page);
}

export async function POST(request: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const guard = await requireContactRoute(request, id);
  if (guard instanceof NextResponse) return guard;
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  try {
    const noteId = await createContactNote({
      contactId: id,
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
