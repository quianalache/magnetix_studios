import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { duplicateIdea } from "@/lib/server/ytcs-service";

/** POST /api/sub-accounts/[id]/ytcs/ideas/[ideaId]/duplicate — see
 *  `duplicateIdea`'s doc comment for the disclosed duplication semantics. */
export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string; ideaId: string }> },
) {
  const { id: subAccountId, ideaId } = await ctx.params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;

  const idea = await duplicateIdea(subAccountId, ideaId);
  if (!idea) {
    return NextResponse.json({ error: "Idea not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, idea });
}
