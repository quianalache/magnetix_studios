import { notFound, redirect } from "next/navigation";
import { requireGroupPageAccess } from "@/lib/community/member-context";
import { isCommunityPrettyRequest } from "@/lib/community/domain";
import { communityLearningHref, communityLearningLessonHref } from "@/lib/community/routes";
import { getCourseTree } from "@/lib/server/community-classroom-service";

export const dynamic = "force-dynamic";

/** Course index — redirect to the first published lesson, or back to the
 *  catalog when the course is empty. */
export default async function CourseIndexPage({
  params,
}: {
  params: Promise<{ saId: string; groupSlug: string; courseId: string }>;
}) {
  const { saId, groupSlug, courseId } = await params;
  const access = await requireGroupPageAccess(saId, groupSlug);
  if (access.kind === "notFound") notFound();
  if (access.kind === "redirect") redirect(access.to);

  const pretty = await isCommunityPrettyRequest(saId);
  const linkBase = { saId, pretty };

  const tree = await getCourseTree({
    subAccountId: saId,
    groupId: access.group.id,
    courseId,
    includeUnpublished: false,
  });
  const first = tree?.lessons[0];
  if (!tree || !tree.course.published || !first) {
    redirect(communityLearningHref(linkBase, groupSlug));
  }
  redirect(communityLearningLessonHref(linkBase, groupSlug, courseId, first.id));
}
