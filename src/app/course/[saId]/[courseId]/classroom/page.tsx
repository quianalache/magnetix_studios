import { notFound, redirect } from "next/navigation";
import { requireCourseClassroomAccess } from "@/lib/standalone-courses/course-access";
import { getStandaloneCourseTree } from "@/lib/server/standalone-course-service";

export const dynamic = "force-dynamic";

/** Course index — redirect to the first published lesson. */
export default async function StandaloneCourseIndexPage({
  params,
}: {
  params: Promise<{ saId: string; courseId: string }>;
}) {
  const { saId, courseId } = await params;
  const access = await requireCourseClassroomAccess(saId, courseId);
  if (access.kind === "notFound") notFound();
  if (access.kind === "redirect") redirect(access.to);

  const tree = await getStandaloneCourseTree({
    subAccountId: saId,
    courseId,
    includeUnpublished: false,
  });
  const first = tree?.lessons[0];
  if (!tree || !tree.course.published || !first) {
    redirect(`/course/${saId}/${courseId}`);
  }
  redirect(`/course/${saId}/${courseId}/classroom/${first.id}`);
}
