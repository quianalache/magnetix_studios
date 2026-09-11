import { notFound, redirect } from "next/navigation";
import { requireStaffGroupPageAccess } from "@/lib/community/member-context";
import { communityLearningHref } from "@/lib/community/routes";
import { EmbeddedProductLesson } from "@/components/community/classroom/embedded-product-lesson";

export const dynamic = "force-dynamic";

/**
 * Staff Community-in-CRM preview of a linked Standalone Product's lesson,
 * inside the same embedded Community shell a member would see. Shares
 * `EmbeddedProductLesson` with the member-facing route — see that file for
 * the actual course/entitlement/rendering logic and the security checks.
 * Close mirror of
 * (immersive)/.../classroom/[courseId]/[lessonId]/page.tsx (the native
 * course's staff lesson page).
 */
export default async function StaffEmbeddedProductLessonPage({
  params,
}: {
  params: Promise<{
    subAccountId: string;
    groupId: string;
    courseId: string;
    lessonId: string;
  }>;
}) {
  const { subAccountId: saId, groupId, courseId, lessonId } = await params;
  const access = await requireStaffGroupPageAccess(
    saId,
    groupId,
    `/sa/${saId}/community/${groupId}/classroom/product/${courseId}/${lessonId}`
  );
  if (access.kind === "notFound") notFound();
  if (access.kind === "redirect") redirect(access.to);

  const linkBase = { saId, pretty: false, staffGroupId: groupId };
  const { group, member, membership } = access;

  return EmbeddedProductLesson({
    saId,
    courseId,
    lessonId,
    group,
    member,
    membership,
    linkBase,
    groupSlug: group.slug,
    catalogHref: communityLearningHref(linkBase, group.slug),
    shellExtra: { staffGroupId: groupId, embedded: false },
  });
}
