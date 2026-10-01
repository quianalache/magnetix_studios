import { notFound, redirect } from "next/navigation";
import { requireGroupPageAccess } from "@/lib/community/member-context";
import { isCommunityPrettyRequest } from "@/lib/community/domain";
import { communityLearningHref } from "@/lib/community/routes";
import { EmbeddedProductCourse } from "@/components/community/classroom/embedded-product-course";
import { isStartLearningRequest } from "@/lib/standalone-courses/course-navigation";

export const dynamic = "force-dynamic";

export default async function CommunityEmbeddedProductCoursePage({
  params,
  searchParams,
}: {
  params: Promise<{ saId: string; groupSlug: string; courseId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { saId, groupSlug, courseId } = await params;
  const access = await requireGroupPageAccess(saId, groupSlug, {
    opaque: `/c/${saId}/${groupSlug}/classroom/product/${courseId}`,
    pretty: `/communities/${groupSlug}/learning/product/${courseId}`,
  });
  if (access.kind === "notFound") notFound();
  if (access.kind === "redirect") redirect(access.to);
  const pretty = await isCommunityPrettyRequest(saId);
  const { group, member, membership } = access;
  return EmbeddedProductCourse({
    saId,
    courseId,
    group,
    member,
    membership,
    linkBase: { saId, pretty },
    groupSlug,
    catalogHref: communityLearningHref({ saId, pretty }, groupSlug),
    isStartLearning: isStartLearningRequest(await searchParams),
  });
}
