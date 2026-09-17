import "server-only";

import { NextResponse } from "next/server";
import { resolveAgencyCommunityCaller } from "@/lib/server/agency-community-access";
import { toggleAgencyPostLikeServerSide } from "@/lib/server/community-agency-service";

export const dynamic = "force-dynamic";

/** Agency Community — toggle a like on a post. Owner OR an active member. */
export async function POST(
  request: Request,
  ctx: { params: Promise<{ groupId: string; postId: string }> },
) {
  const { groupId, postId } = await ctx.params;
  const caller = await resolveAgencyCommunityCaller(request, groupId);
  if (caller instanceof NextResponse) return caller;
  const viewerId = caller.kind === "owner" ? caller.uid : caller.personId;

  const result = await toggleAgencyPostLikeServerSide(
    caller.agencyId,
    groupId,
    postId,
    viewerId,
  );
  return NextResponse.json({ ok: true, ...result });
}
