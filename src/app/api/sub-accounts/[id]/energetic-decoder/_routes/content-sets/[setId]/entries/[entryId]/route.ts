import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";
import { resetContentEntry, saveContentEntry } from "@/lib/server/content-set-service";
import { contentSetErrorResponse, decodeParam } from "@/lib/server/content-set-route-helpers";

type Ctx = { params: Promise<{ id: string; setId: string; entryId: string }> };

/** Save one entry's fixed fields (+ optional custom term on custom sets). Over-length text is refused, never truncated. */
export async function PUT(request: Request, ctx: Ctx) {
  const { id: subAccountId, setId, entryId } = await ctx.params;
  const access = await requireSubAccountAdmin(request, subAccountId);
  if (access instanceof NextResponse) return access;
  const body = (await request.json().catch(() => ({}))) as { label?: unknown; fields?: unknown };
  try {
    await saveContentEntry(subAccountId, access, setId, decodeParam(entryId), { label: body.label, fields: body.fields });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return contentSetErrorResponse(err);
  }
}

/** Default: reset to the shipped Magnetix text. Custom set: clear the entry (it stays blank). */
export async function DELETE(request: Request, ctx: Ctx) {
  const { id: subAccountId, setId, entryId } = await ctx.params;
  const access = await requireSubAccountAdmin(request, subAccountId);
  if (access instanceof NextResponse) return access;
  try {
    await resetContentEntry(subAccountId, access, setId, decodeParam(entryId));
    return NextResponse.json({ ok: true });
  } catch (err) {
    return contentSetErrorResponse(err);
  }
}
