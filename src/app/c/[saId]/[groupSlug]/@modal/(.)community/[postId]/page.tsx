import { notFound, redirect } from "next/navigation";
import { requireGroupPageAccess } from "@/lib/community/member-context";
import { isCommunityPrettyRequest } from "@/lib/community/domain";
import { loadCommunityPostDetail } from "@/lib/community/load-post-detail";
import { COMMUNITY_DEFAULT_BRAND } from "@/components/community/community-shell";
import { PostDetailView } from "@/components/community/feed/post-detail-view";
import { PostDetailModalShell } from "@/components/community/feed/post-detail-modal-shell";
import { resolveCommunityTheme } from "@/lib/community/community-theme-presets";

export const dynamic = "force-dynamic";

/**
 * Intercepted version of .../community/[postId] — same access check and
 * data (loadCommunityPostDetail, shared with the real page), rendered as
 * an overlay ON TOP of the feed page still mounted behind it instead of
 * CommunityShell's own full-page chrome. Only reached via client-side
 * navigation from within /c/[saId]/[groupSlug]/* (a `<Link>`/router.push
 * to the canonical post URL); a hard load or refresh always hits the real
 * page.tsx one directory up instead — Next's intercepting-route
 * convention, not a second, divergent post-detail implementation (same
 * PostDetailView, same loader).
 *
 * Also reused directly (2026-09-03) by the pretty/custom-domain mirror's
 * own intercepted route (@modal/(.)home/[postId] under
 * /communities/[groupSlug]) the exact same way the existing full-page
 * mirror already delegates to the opaque full page — see this file's own
 * `isCommunityPrettyRequest` call, which resolves from the CURRENT
 * request's host regardless of which route delegated here, so a visitor
 * on the custom domain gets pretty-shaped internal links (e.g. a
 * #channelRef inside the post body) even though this component's own
 * saId/groupSlug params stay opaque-shaped either way.
 */
export default async function InterceptedPostDetailModal({
  params,
}: {
  params: Promise<{ saId: string; groupSlug: string; postId: string }>;
}) {
  const { saId, groupSlug, postId } = await params;
  const access = await requireGroupPageAccess(saId, groupSlug, {
    opaque: `/c/${saId}/${groupSlug}/community/${postId}`,
    pretty: `/communities/${groupSlug}/home/${postId}`,
  });
  if (access.kind === "notFound") notFound();
  if (access.kind === "redirect") redirect(access.to);

  const pretty = await isCommunityPrettyRequest(saId);
  const { group, member, membership } = access;
  const resolvedTheme = resolveCommunityTheme(group);
  const brand = resolvedTheme.primary || COMMUNITY_DEFAULT_BRAND;

  const detail = await loadCommunityPostDetail({
    subAccountId: saId,
    groupId: group.id,
    postId,
    viewerMemberId: member.id,
    viewerIsModerator: membership.role === "moderator",
  });
  if (!detail) notFound();
  const { post, comments } = detail;

  const displayName =
    member.displayName?.trim() || member.email.split("@")[0] || "Member";

  return (
    <PostDetailModalShell>
      <PostDetailView
        saId={saId}
        pretty={pretty}
        groupId={group.id}
        groupSlug={group.slug}
        brand={brand}
        primaryAction={resolvedTheme.primaryAction}
        accent={resolvedTheme.accent}
        communityName={group.name}
        categories={group.categories}
        post={post}
        initialComments={comments}
        viewer={{
          memberId: member.id,
          role: membership.role,
          displayName,
          avatarUrl: member.avatarUrl,
          level: membership.level,
        }}
      />
    </PostDetailModalShell>
  );
}
