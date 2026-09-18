import { NextResponse } from "next/server";
import { resolveAgencyCommunityCaller, agencyMemberDisplayName } from "@/lib/server/agency-community-access";
import { resolveBrandName } from "@/lib/landing/resolve-brand";
import { voteAgencyPollServerSide } from "@/lib/server/community-agency-service";

export const dynamic = "force-dynamic";

/** Agency Community — cast or change a vote on a poll, `{ optionIds: string[] }`.
 *  Available to the owner or any active member (not moderator-gated — creating
 *  a poll is a moderator/owner action, voting is a normal member action). */
export async function POST(
  request: Request,
  ctx: { params: Promise<{ groupId: string; postId: string }> },
) {
  const { groupId, postId } = await ctx.params;
  const caller = await resolveAgencyCommunityCaller(request, groupId);
  if (caller instanceof NextResponse) return caller;

  let body: { optionIds?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const optionIds = Array.isArray(body.optionIds)
    ? body.optionIds.filter((id): id is string => typeof id === "string")
    : [];

  const viewerId = caller.kind === "owner" ? caller.uid : caller.personId;
  const viewerDisplayName =
    caller.kind === "owner" ? await resolveBrandName() : agencyMemberDisplayName(caller.membership);

  const result = await voteAgencyPollServerSide({
    agencyId: caller.agencyId,
    groupId,
    postId,
    viewerId,
    viewerDisplayName,
    viewerIsModerator: caller.kind === "owner",
    optionIds,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ ok: true, poll: result.poll });
}
