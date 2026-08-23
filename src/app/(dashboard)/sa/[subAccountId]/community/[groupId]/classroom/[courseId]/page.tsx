import { notFound, redirect } from "next/navigation";
import { requireStaffGroupPageAccess } from "@/lib/community/member-context";
import { communityLearningHref, communityLearningLessonHref } from "@/lib/community/routes";
import { getCourseTree } from "@/lib/server/community-classroom-service";

export const dynamic = "force-dynamic";

/** Staff Community-in-CRM — course index. Close mirror of
 *  /c/[saId]/[groupSlug]/classroom/[courseId]/page.tsx: redirect to the
 *  first published lesson, or back to the catalog when the course is empty. */
export default async function StaffCourseIndexPage({
  params,
}: {
  params: Promise<{ subAccountId: string; groupId: string; courseId: string }>;
}) {
  const { subAccountId: saId, groupId, courseId } = await params;
  const access = await requireStaffGroupPageAccess(saId, groupId, `/sa/${saId}/community/${groupId}/classroom/${courseId}`);
  if (access.kind === "notFound") notFound();
  if (access.kind === "redirect") redirect(access.to);

  const linkBase = { saId, pretty: false, staffGroupId: groupId };

  const tree = await getCourseTree({
    subAccountId: saId,
    groupId: access.group.id,
    courseId,
    includeUnpublished: false,
  });
  const first = tree?.lessons[0];
  if (!tree || !tree.course.published || !first) {
    redirect(communityLearningHref(linkBase, access.group.slug));
  }
  redirect(communityLearningLessonHref(linkBase, access.group.slug, courseId, first.id));
}
