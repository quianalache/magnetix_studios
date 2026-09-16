import "server-only";

import { NextResponse } from "next/server";
import { requireAgencyOwnerAny } from "@/lib/auth/require-tenancy";
import { toggleAgencyPostLikeServerSide } from "@/lib/server/community-agency-service";

export const dynamic = "force-dynamic";

/** Agency Community — toggle a like on a post. Owner-only. */
export async function POST(
  request: Request,
  ctx: { params: Promise<{ groupId: string; postId: string }> },
) {
  const caller = await requireAgencyOwnerAny(request);
  if (caller instanceof NextResponse) return caller;
  const { groupId, postId } = await ctx.params;

  const result = await toggleAgencyPostLikeServerSide(
    caller.agencyId!,
    groupId,
    postId,
    caller.uid,
  );
  return NextResponse.json({ ok: true, ...result });
}
