import "server-only";

import { NextResponse } from "next/server";
import { resolveAgencyCommunityCaller } from "@/lib/server/agency-community-access";
import {
  getAgencyCourseTree,
  getAgencyEnrollment,
} from "@/lib/server/agency-community-classroom-service";
import { embedUrlFor } from "@/lib/community/video-embed";
import { renderLessonBodyHtml } from "@/lib/community/lesson-html";

export const dynamic = "force-dynamic";

/** Agency Community Classroom — course + lessons + the caller's own
 *  enrollment/progress, for the lesson player. Owner OR an active member.
 *  Access locks (level; "purchase" always locked — see this file's
 *  sibling service module comment) are enforced here, server-side. */
export async function GET(
  request: Request,
  ctx: { params: Promise<{ groupId: string; courseId: string }> },
) {
  const { groupId, courseId } = await ctx.params;
  const caller = await resolveAgencyCommunityCaller(request, groupId);
  if (caller instanceof NextResponse) return caller;
  const isOwner = caller.kind === "owner";
  const memberId = isOwner ? caller.uid : caller.personId;
  const viewerLevel = isOwner ? Number.POSITIVE_INFINITY : (caller.membership.level ?? 1);

  const tree = await getAgencyCourseTree({
    agencyId: caller.agencyId,
    groupId,
    courseId,
    includeUnpublished: isOwner,
  });
  if (!tree || (!isOwner && !tree.course.published)) {
    return NextResponse.json({ error: "Course not found" }, { status: 404 });
  }
  if (!isOwner) {
    if (tree.course.access === "level" && viewerLevel < (tree.course.requiredLevel ?? 2)) {
      return NextResponse.json({ error: "This course is locked" }, { status: 403 });
    }
    if (tree.course.access === "purchase") {
      return NextResponse.json({ error: "This course is locked" }, { status: 403 });
    }
  }

  const enrollment = await getAgencyEnrollment(caller.agencyId, groupId, courseId, memberId);
  const sections = tree.sections.map((s) => ({ id: s.id, title: s.title }));
  const lessons = tree.lessons.map((l) => ({
    id: l.id,
    title: l.title,
    sectionId: l.sectionId,
    published: l.published,
    embedUrl: embedUrlFor(l.videoProvider, l.videoId),
    body: renderLessonBodyHtml(l.bodyHtml),
    resourceLinks: l.resourceLinks ?? [],
  }));
  return NextResponse.json({
    course: tree.course,
    sections,
    lessons,
    completedIds: enrollment?.completedLessonIds ?? [],
  });
}
