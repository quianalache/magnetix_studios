import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { deleteMemory } from "@/lib/server/reflection-service";

export async function DELETE(
  request: Request,
  ctx: { params: Promise<{ id: string; memoryId: string }> },
) {
  const { id: subAccountId, memoryId } = await ctx.params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;

  try {
    await deleteMemory(subAccountId, memoryId);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Memory not found" }, { status: 404 });
  }
}
