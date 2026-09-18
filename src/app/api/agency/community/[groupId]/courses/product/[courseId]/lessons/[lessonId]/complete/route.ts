import "server-only";

import { NextResponse } from "next/server";
import { resolveAgencyCommunityCaller } from "@/lib/server/agency-community-access";
import { getAgencyStandaloneCourse, markAgencyStandaloneLessonCompleteServerSide } from "@/lib/server/agency-standalone-course-service";

export const dynamic = "force-dynamic";

/** Owner OR an active member: mark a linked Agency Standalone Course
 *  lesson complete from inside the Community-embedded bridge. Writes to
 *  the course's own enrollment doc (`markAgencyStandaloneLessonCompleteServerSide`)
 *  — the SAME progress record the course's own direct site reads —
 *  never a second, Community-local copy. */
export async function POST(
  request: Request,
  ctx: { params: Promise<{ groupId: string; courseId: string; lessonId: string }> },
) {
  const { groupId, courseId, lessonId } = await ctx.params;
  const caller = await resolveAgencyCommunityCaller(request, groupId);
  if (caller instanceof NextResponse) return caller;
  const personId = caller.kind === "owner" ? caller.uid : caller.personId;

  const course = await getAgencyStandaloneCourse(caller.agencyId, courseId);
  if (!course || !course.linkedCommunityGroupIds.includes(groupId)) {
    return NextResponse.json({ error: "Course not found" }, { status: 404 });
  }

  const result = await markAgencyStandaloneLessonCompleteServerSide({
    agencyId: caller.agencyId,
    courseId,
    personId,
    lessonId,
  });
  return NextResponse.json({ ok: true, ...result });
}
