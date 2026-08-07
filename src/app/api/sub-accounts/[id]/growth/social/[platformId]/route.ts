import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { deleteSocialPlatform } from "@/lib/server/growth-service";

export async function DELETE(
  request: Request,
  ctx: { params: Promise<{ id: string; platformId: string }> },
) {
  const { id: subAccountId, platformId } = await ctx.params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;
  await deleteSocialPlatform(platformId);
  return NextResponse.json({ ok: true });
}
