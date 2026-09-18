import "server-only";

import { NextResponse } from "next/server";
import { resolveAgencyCommunityCaller } from "@/lib/server/agency-community-access";
import { markAgencyLessonCompleteServerSide } from "@/lib/server/agency-community-classroom-service";

export const dynamic = "force-dynamic";

/** Owner OR an active member: mark a lesson complete (idempotent). The
 *  owner has no roster membership of their own — the caller's stable id
 *  (uid or personId) doubles as the enrollment key, same convention as
 *  points/DMs elsewhere in this codebase. */
export async function POST(
  request: Request,
  ctx: { params: Promise<{ groupId: string; courseId: string; lessonId: string }> },
) {
  const { groupId, courseId, lessonId } = await ctx.params;
  const caller = await resolveAgencyCommunityCaller(request, groupId);
  if (caller instanceof NextResponse) return caller;
  const memberId = caller.kind === "owner" ? caller.uid : caller.personId;

  const result = await markAgencyLessonCompleteServerSide({
    agencyId: caller.agencyId,
    groupId,
    courseId,
    memberId,
    lessonId,
  });
  return NextResponse.json({ ok: true, ...result });
}
