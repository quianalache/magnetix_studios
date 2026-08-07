import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { deleteMoneyEntry } from "@/lib/server/growth-service";

export async function DELETE(
  request: Request,
  ctx: { params: Promise<{ id: string; entryId: string }> },
) {
  const { id: subAccountId, entryId } = await ctx.params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;
  await deleteMoneyEntry(entryId);
  return NextResponse.json({ ok: true });
}
