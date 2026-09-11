import { notFound, redirect } from "next/navigation";
import { requireGroupPageAccess } from "@/lib/community/member-context";
import { isCommunityPrettyRequest } from "@/lib/community/domain";
import { communityLearningHref } from "@/lib/community/routes";
import { EmbeddedProductLesson } from "@/components/community/classroom/embedded-product-lesson";

export const dynamic = "force-dynamic";

/**
 * A linked Standalone Product's lesson, rendered inside THIS Community's
 * shell (2026-09-11) — the Community-embedded presentation path. All the
 * actual course/entitlement/rendering logic lives in
 * `EmbeddedProductLesson` (shared with the staff route below); this page
 * only resolves genuine Community membership in this group before calling
 * it. The Standalone product's own direct route
 * (`/course/{saId}/{courseId}/classroom/...`) is untouched and keeps
 * working identically — this is an additional presentation path.
 */
export default async function CommunityEmbeddedProductLessonPage({
  params,
}: {
  params: Promise<{
    saId: string;
    groupSlug: string;
    courseId: string;
    lessonId: string;
  }>;
}) {
  const { saId, groupSlug, courseId, lessonId } = await params;
  const access = await requireGroupPageAccess(saId, groupSlug, {
    opaque: `/c/${saId}/${groupSlug}/classroom/product/${courseId}/${lessonId}`,
    pretty: `/communities/${groupSlug}/learning/product/${courseId}/${lessonId}`,
  });
  if (access.kind === "notFound") notFound();
  if (access.kind === "redirect") redirect(access.to);

  const pretty = await isCommunityPrettyRequest(saId);
  const linkBase = { saId, pretty };
  const { group, member, membership } = access;

  return EmbeddedProductLesson({
    saId,
    courseId,
    lessonId,
    group,
    member,
    membership,
    linkBase,
    groupSlug,
    catalogHref: communityLearningHref(linkBase, groupSlug),
  });
}
