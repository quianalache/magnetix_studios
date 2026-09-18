import "server-only";

import { NextResponse } from "next/server";
import { resolveAgencyCommunityCaller } from "@/lib/server/agency-community-access";
import {
  getAgencyStandaloneCourse,
  getAgencyStandaloneCourseTree,
  getAgencyStandaloneEnrollment,
  filterAgencyLessonsForEnrollment,
} from "@/lib/server/agency-standalone-course-service";
import { checkAgencyCourseEntitlementForPerson } from "@/lib/standalone-courses/agency-course-access";
import { embedUrlFor } from "@/lib/community/video-embed";
import { renderLessonBodyHtml } from "@/lib/community/lesson-html";

export const dynamic = "force-dynamic";

/** Agency Community Classroom — a linked Agency Standalone Course's
 *  lessons, for the Community-embedded lesson bridge. Owner OR an active
 *  member; the owner always sees their own linked course unlocked (same
 *  "author isn't gated out of their own content" reasoning as the native
 *  course player route), a member must pass the course's own entitlement
 *  check (`checkAgencyCourseEntitlementForPerson` — the exact same check
 *  the course's own direct site enforces, so this bridge can never be a
 *  looser access path than the canonical one). */
export async function GET(
  request: Request,
  ctx: { params: Promise<{ groupId: string; courseId: string }> },
) {
  const { groupId, courseId } = await ctx.params;
  const caller = await resolveAgencyCommunityCaller(request, groupId);
  if (caller instanceof NextResponse) return caller;
  const isOwner = caller.kind === "owner";
  const memberId = isOwner ? caller.uid : caller.personId;

  const course = await getAgencyStandaloneCourse(caller.agencyId, courseId);
  if (!course || !course.published || !course.linkedCommunityGroupIds.includes(groupId)) {
    return NextResponse.json({ error: "Course not found" }, { status: 404 });
  }
  if (!isOwner) {
    const entitled = await checkAgencyCourseEntitlementForPerson(caller.agencyId, course, memberId);
    if (!entitled) return NextResponse.json({ error: "This course is locked" }, { status: 403 });
  }

  const tree = await getAgencyStandaloneCourseTree({ agencyId: caller.agencyId, courseId, includeUnpublished: false });
  if (!tree) return NextResponse.json({ error: "Course not found" }, { status: 404 });

  const enrollment = await getAgencyStandaloneEnrollment(caller.agencyId, courseId, memberId);
  const visibleLessons = filterAgencyLessonsForEnrollment(tree.lessons, enrollment);
  const sections = tree.sections.map((s) => ({ id: s.id, title: s.title }));
  const lessons = visibleLessons.map((l) => ({
    id: l.id,
    title: l.title,
    sectionId: l.sectionId,
    published: l.published,
    embedUrl: embedUrlFor(l.videoProvider, l.videoId),
    body: renderLessonBodyHtml(l.bodyHtml),
    resourceLinks: l.resourceLinks ?? [],
  }));
  return NextResponse.json({
    course: { id: course.id, title: course.title },
    sections,
    lessons,
    completedIds: enrollment?.completedLessonIds ?? [],
  });
}
