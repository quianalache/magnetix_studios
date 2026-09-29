import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { deletePagePerformance } from "@/lib/server/growth-service";

export async function DELETE(
  request: Request,
  ctx: { params: Promise<{ id: string; pageId: string }> },
) {
  const { id: subAccountId, pageId } = await ctx.params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;
  await deletePagePerformance(pageId);
  return NextResponse.json({ ok: true });
}
