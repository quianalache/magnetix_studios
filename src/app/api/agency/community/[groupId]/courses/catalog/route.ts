import "server-only";

import { NextResponse } from "next/server";
import { resolveAgencyCommunityCaller } from "@/lib/server/agency-community-access";
import { listAgencyCoursesForMember } from "@/lib/server/agency-community-classroom-service";
import { getAgencyGroupById } from "@/lib/server/community-agency-service";

export const dynamic = "force-dynamic";

/** Agency Community Classroom catalog — owner OR an active member. The
 *  owner has no roster membership/level of their own; their own courses
 *  always render unlocked for them (there is no level to gate against,
 *  and gating the author out of content they authored, with no way to
 *  grant themselves access, would be actively unhelpful — see
 *  agency-community-classroom-service.ts's module comment for the
 *  parallel "purchase" reasoning). */
export async function GET(request: Request, ctx: { params: Promise<{ groupId: string }> }) {
  const { groupId } = await ctx.params;
  const caller = await resolveAgencyCommunityCaller(request, groupId);
  if (caller instanceof NextResponse) return caller;

  const group = await getAgencyGroupById(caller.agencyId, groupId);
  if (!group) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const memberId = caller.kind === "owner" ? caller.uid : caller.personId;
  const viewerLevel = caller.kind === "owner" ? Number.POSITIVE_INFINITY : (caller.membership.level ?? 1);

  const courses = await listAgencyCoursesForMember({
    linkBase: { saId: "", pretty: false, agencyGroupId: groupId, agencyMemberView: caller.kind === "member" },
    groupId,
    groupSlug: group.slug,
    memberId,
    viewerLevel,
  });
  return NextResponse.json({ courses });
}
