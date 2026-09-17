import "server-only";

import { NextResponse } from "next/server";
import { resolveAgencyCommunityCaller } from "@/lib/server/agency-community-access";
import { toggleAgencyCommentLikeServerSide } from "@/lib/server/community-agency-service";

export const dynamic = "force-dynamic";

/** Agency Community — toggle a like on a comment. Owner OR an active member. */
export async function POST(
  request: Request,
  ctx: { params: Promise<{ groupId: string; postId: string; commentId: string }> },
) {
  const { groupId, postId, commentId } = await ctx.params;
  const caller = await resolveAgencyCommunityCaller(request, groupId);
  if (caller instanceof NextResponse) return caller;
  const viewerId = caller.kind === "owner" ? caller.uid : caller.personId;

  const result = await toggleAgencyCommentLikeServerSide(
    caller.agencyId,
    groupId,
    postId,
    commentId,
    viewerId,
  );
  return NextResponse.json({ ok: true, ...result });
}
