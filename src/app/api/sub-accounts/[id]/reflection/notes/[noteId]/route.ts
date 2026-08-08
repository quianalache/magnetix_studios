import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { deleteNote } from "@/lib/server/reflection-service";

export async function DELETE(
  request: Request,
  ctx: { params: Promise<{ id: string; noteId: string }> },
) {
  const { id: subAccountId, noteId } = await ctx.params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;

  try {
    await deleteNote(subAccountId, noteId);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Note not found" }, { status: 404 });
  }
}
