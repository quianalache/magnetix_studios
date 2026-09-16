import "server-only";

import { NextResponse } from "next/server";
import { requireAgencyOwnerAny } from "@/lib/auth/require-tenancy";
import { toggleAgencyCommentLikeServerSide } from "@/lib/server/community-agency-service";

export const dynamic = "force-dynamic";

/** Agency Community — toggle a like on a comment. Owner-only. */
export async function POST(
  request: Request,
  ctx: { params: Promise<{ groupId: string; postId: string; commentId: string }> },
) {
  const caller = await requireAgencyOwnerAny(request);
  if (caller instanceof NextResponse) return caller;
  const { groupId, postId, commentId } = await ctx.params;

  const result = await toggleAgencyCommentLikeServerSide(
    caller.agencyId!,
    groupId,
    postId,
    commentId,
    caller.uid,
  );
  return NextResponse.json({ ok: true, ...result });
}
