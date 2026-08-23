import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireStaffGroupPageAccess } from "@/lib/community/member-context";
import {
  getFeedPost,
  listComments,
} from "@/lib/server/community-feed-service";
import {
  CommunityShell,
  COMMUNITY_DEFAULT_BRAND,
} from "@/components/community/community-shell";
import {
  PostDetailView,
  type ClientComment,
} from "@/components/community/feed/post-detail-view";
import type { ClientPost } from "@/components/community/feed/feed-view";
import { renderCommunityPostHtml, renderCommunityCommentHtml } from "@/lib/community/post-html";
import { communityHomeHref } from "@/lib/community/routes";
import type { AuthorView } from "@/types/community";

export const dynamic = "force-dynamic";

function toMillis(v: unknown): number | null {
  if (!v) return null;
  const m = v as {
    toMillis?: () => number;
    toDate?: () => Date;
    seconds?: number;
    _seconds?: number;
  };
  if (typeof m.toMillis === "function") return m.toMillis();
  if (typeof m.toDate === "function") return m.toDate().getTime();
  if (typeof m.seconds === "number") return m.seconds * 1000;
  if (typeof m._seconds === "number") return m._seconds * 1000;
  return null;
}

/** Staff Community-in-CRM — post detail (comments/replies). Close mirror of
 *  /c/[saId]/[groupSlug]/community/[postId]/page.tsx — see the Staff
 *  Community Integration report. */
export default async function StaffPostDetailPage({
  params,
}: {
  params: Promise<{ subAccountId: string; groupId: string; postId: string }>;
}) {
  const { subAccountId: saId, groupId, postId } = await params;
  const access = await requireStaffGroupPageAccess(saId, groupId, `/sa/${saId}/community/${groupId}/post/${postId}`);
  if (access.kind === "notFound") notFound();
  if (access.kind === "redirect") redirect(access.to);

  const { group, member, membership } = access;
  const brand = group.brandColor?.trim() || COMMUNITY_DEFAULT_BRAND;

  const feedPost = await getFeedPost({
    subAccountId: saId,
    groupId: group.id,
    postId,
    viewerMemberId: member.id,
    viewerIsModerator: membership.role === "moderator",
  });
  if (!feedPost) notFound();

  const comments = await listComments({
    subAccountId: saId,
    groupId: group.id,
    postId,
    viewerMemberId: member.id,
  });

  const viewer: AuthorView = {
    memberId: member.id,
    displayName:
      member.displayName?.trim() || member.email.split("@")[0] || "Member",
    avatarUrl: member.avatarUrl,
    level: membership.level,
  };

  const post: ClientPost = {
    id: feedPost.id,
    authorMemberId: feedPost.authorMemberId,
    title: feedPost.title,
    body: renderCommunityPostHtml(feedPost.body),
    attachments: feedPost.attachments,
    category: feedPost.category,
    commentsDisabled: feedPost.commentsDisabled,
    pinned: feedPost.pinned,
    pinnedAtMs: toMillis(feedPost.pinnedAt),
    pinnedToChannel: feedPost.pinnedToChannel === true,
    channelPinnedAtMs: toMillis(feedPost.channelPinnedAt),
    likeCount: feedPost.likeCount,
    commentCount: feedPost.commentCount,
    createdAtMs: toMillis(feedPost.createdAt),
    author: feedPost.author,
    likedByViewer: feedPost.likedByViewer,
    poll: feedPost.poll,
  };

  const clientComments: ClientComment[] = comments.map((c) => ({
    id: c.id,
    body: renderCommunityCommentHtml(c.body),
    likeCount: c.likeCount,
    likedByViewer: c.likedByViewer,
    createdAtMs: toMillis(c.createdAt),
    parentId: c.parentId ?? null,
    author: c.author,
    attachments: c.attachments,
    edited: !!c.editedAt,
  }));

  return (
    <CommunityShell saId={saId} group={group} active="community" viewer={viewer} viewerIsModerator={membership.role === "moderator"} staffGroupId={groupId}>
      <Link
        href={communityHomeHref({ saId, pretty: false, staffGroupId: groupId }, group.slug)}
        className="mb-3 inline-flex items-center gap-1 text-sm text-[#909090] hover:text-[#202124]"
      >
        <ArrowLeft className="h-4 w-4" /> Back to feed
      </Link>
      <PostDetailView
        saId={saId}
        staffGroupId={groupId}
        groupId={group.id}
        groupSlug={group.slug}
        brand={brand}
        communityName={group.name}
        categories={group.categories}
        post={post}
        initialComments={clientComments}
        viewer={{
          memberId: member.id,
          role: membership.role,
          displayName: viewer.displayName,
          avatarUrl: viewer.avatarUrl,
          level: viewer.level,
        }}
      />
    </CommunityShell>
  );
}
