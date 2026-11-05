import { notFound, redirect } from "next/navigation";
import { requireStaffGroupPageAccess } from "@/lib/community/member-context";
import { communityLearningHref } from "@/lib/community/routes";
import { EmbeddedProductCourse } from "@/components/community/classroom/embedded-product-course";
import { isStartLearningRequest } from "@/lib/standalone-courses/course-navigation";

export const dynamic = "force-dynamic";

/**
 * Staff Community-in-CRM view of a linked Standalone Product's course home —
 * the staff twin of /c/[saId]/[groupSlug]/classroom/product/[courseId].
 *
 * Missing until 2026-11-05: the staff Classroom catalog links linked
 * products to `/classroom/product/{courseId}`, and without this page that
 * URL fell through to the native lesson route `[courseId]/[lessonId]` with
 * courseId = "product", which found no course and redirected back to the
 * catalog ("blank page, then back to the Classroom list"). Same shared
 * component and access checks as the member page and the staff lesson page.
 */
export default async function StaffEmbeddedProductCoursePage({
  params,
  searchParams,
}: {
  params: Promise<{ subAccountId: string; groupId: string; courseId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { subAccountId: saId, groupId, courseId } = await params;
  const access = await requireStaffGroupPageAccess(
    saId,
    groupId,
    `/sa/${saId}/community/${groupId}/classroom/product/${courseId}`
  );
  if (access.kind === "notFound") notFound();
  if (access.kind === "redirect") redirect(access.to);

  const linkBase = { saId, pretty: false, staffGroupId: groupId };
  const { group, member, membership } = access;

  return EmbeddedProductCourse({
    saId,
    courseId,
    group,
    member,
    membership,
    linkBase,
    groupSlug: group.slug,
    catalogHref: communityLearningHref(linkBase, group.slug),
    shellExtra: { staffGroupId: groupId, embedded: false },
    isStartLearning: isStartLearningRequest(await searchParams),
  });
}
