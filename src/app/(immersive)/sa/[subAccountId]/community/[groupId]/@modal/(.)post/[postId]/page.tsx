import { notFound, redirect } from "next/navigation";
import { requireStaffGroupPageAccess } from "@/lib/community/member-context";
import { loadCommunityPostDetail } from "@/lib/community/load-post-detail";
import { COMMUNITY_DEFAULT_BRAND } from "@/components/community/community-shell";
import { PostDetailView } from "@/components/community/feed/post-detail-view";
import { PostDetailModalShell } from "@/components/community/feed/post-detail-modal-shell";
import { resolveCommunityTheme } from "@/lib/community/community-theme-presets";

export const dynamic = "force-dynamic";

/**
 * Intercepted version of .../community/[groupId]/post/[postId] — staff/CRM
 * mirror of @modal/(.)community/[postId] under /c/[saId]/[groupSlug]. Same
 * access check and data (loadCommunityPostDetail, shared with the real
 * page), rendered as an overlay instead of CommunityShell's full-page
 * chrome. Only reached via client-side navigation from within
 * /sa/[subAccountId]/community/[groupId]/*; a hard load or refresh hits
 * the real page.tsx one directory up.
 */
export default async function InterceptedStaffPostDetailModal({
  params,
}: {
  params: Promise<{ subAccountId: string; groupId: string; postId: string }>;
}) {
  const { subAccountId: saId, groupId, postId } = await params;
  const access = await requireStaffGroupPageAccess(
    saId,
    groupId,
    `/sa/${saId}/community/${groupId}/post/${postId}`
  );
  if (access.kind === "notFound") notFound();
  if (access.kind === "redirect") redirect(access.to);

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
        staffGroupId={groupId}
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
