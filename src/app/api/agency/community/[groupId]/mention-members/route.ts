import { NextResponse } from "next/server";
import { resolveAgencyCommunityCaller } from "@/lib/server/agency-community-access";
import { searchAgencyGroupMembersServerSide } from "@/lib/server/community-agency-service";

export const dynamic = "force-dynamic";

/** Agency Community — search this group's own active members for the @
 *  mention autocomplete. Owner OR an active member. Uses Agency Community
 *  membership/Person identity — never searches tenant Members. */
export async function GET(
  request: Request,
  ctx: { params: Promise<{ groupId: string }> },
) {
  const { groupId } = await ctx.params;
  const caller = await resolveAgencyCommunityCaller(request, groupId);
  if (caller instanceof NextResponse) return caller;

  const q = new URL(request.url).searchParams.get("q") ?? "";
  const members = await searchAgencyGroupMembersServerSide({
    agencyId: caller.agencyId,
    groupId,
    query: q,
  });
  return NextResponse.json({ members });
}
