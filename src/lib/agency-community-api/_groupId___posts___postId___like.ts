import "server-only";

import { NextResponse } from "next/server";
import { resolveAgencyCommunityCaller } from "@/lib/server/agency-community-access";
import {
  toggleAgencyPostLikeServerSide,
  getAgencyMembershipForPerson,
} from "@/lib/server/community-agency-service";
import { awardAgencyPoints, revokeAgencyPoints } from "@/lib/server/agency-community-points-service";

export const dynamic = "force-dynamic";

/** Agency Community — toggle a like on a post. Owner OR an active member.
 *  "receive_like" points go to the post's author (mirrors tenant
 *  toggleLikeServerSide) — only when the author is a real member (has a
 *  roster membership doc) and isn't the liker themselves. */
export async function POST(
  request: Request,
  ctx: { params: Promise<{ groupId: string; postId: string }> },
) {
  const { groupId, postId } = await ctx.params;
  const caller = await resolveAgencyCommunityCaller(request, groupId);
  if (caller instanceof NextResponse) return caller;
  const viewerId = caller.kind === "owner" ? caller.uid : caller.personId;

  const { liked, authorId } = await toggleAgencyPostLikeServerSide(
    caller.agencyId,
    groupId,
    postId,
    viewerId,
  );

  if (authorId && authorId !== viewerId) {
    const authorMembership = await getAgencyMembershipForPerson(caller.agencyId, groupId, authorId);
    if (authorMembership) {
      const pointsOpts = {
        agencyId: caller.agencyId,
        groupId,
        recipientMembershipId: authorMembership.id,
        actorId: viewerId,
        action: "receive_like" as const,
        sourceEntityId: postId,
      };
      if (liked) {
        await awardAgencyPoints(pointsOpts).catch((err) => console.error("[agency post like] point award failed", err));
      } else {
        await revokeAgencyPoints(pointsOpts).catch((err) => console.error("[agency post like] point revoke failed", err));
      }
    }
  }

  return NextResponse.json({ ok: true, liked });
}
