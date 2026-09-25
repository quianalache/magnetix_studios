import "server-only";

import { NextResponse } from "next/server";
import { requireContactRoute } from "@/lib/server/contact-route-guard";
import {
  ContactFeedError,
  deleteContactNote,
  updateContactNote,
} from "@/lib/server/contact-feed-service";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string; noteId: string }> };

function fail(err: unknown): NextResponse {
  if (err instanceof ContactFeedError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  throw err;
}

/** Edit a note — author only; original author + creation time preserved. */
export async function PATCH(request: Request, ctx: Ctx) {
  const { id, noteId } = await ctx.params;
  const guard = await requireContactRoute(request, id);
  if (guard instanceof NextResponse) return guard;
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  try {
    await updateContactNote({
      contactId: id,
      noteId,
      uid: guard.access.uid,
      content: body.content,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return fail(err);
  }
}

/** Delete a note — the author or a sub-account admin / agency owner. */
export async function DELETE(request: Request, ctx: Ctx) {
  const { id, noteId } = await ctx.params;
  const guard = await requireContactRoute(request, id);
  if (guard instanceof NextResponse) return guard;
  try {
    await deleteContactNote({
      contactId: id,
      noteId,
      caller: { uid: guard.access.uid, isAdmin: guard.isAdmin },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return fail(err);
  }
}
