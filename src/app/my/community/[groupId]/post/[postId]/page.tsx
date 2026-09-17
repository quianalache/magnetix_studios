import { redirect } from "next/navigation";
import { getCurrentPerson } from "@/lib/server/person-session";
import { resolveFirstAgencyId, resolveBrandName } from "@/lib/landing/resolve-brand";
import {
  getAgencyGroupById,
  getAgencyMembershipForPerson,
  activateAgencyMembershipServerSide,
  getAgencyPost,
  listAgencyComments,
  isAgencyPostLikedByViewer,
  isAgencyCommentLikedByViewer,
} from "@/lib/server/community-agency-service";
import { agencyMemberDisplayName } from "@/lib/server/agency-community-access";
import { renderCommunityPostHtml, renderCommunityCommentHtml } from "@/lib/community/post-html";
import {
  CommunityShell,
  COMMUNITY_DEFAULT_BRAND,
} from "@/components/community/community-shell";
import {
  PostDetailView,
  type ClientComment,
} from "@/components/community/feed/post-detail-view";
import type { ClientPost } from "@/components/community/feed/feed-view";
import { resolveCommunityTheme } from "@/lib/community/community-theme-presets";

export const dynamic = "force-dynamic";

function toMillis(v: unknown): number | null {
  const m = v as { toMillis?: () => number } | null;
  return typeof m?.toMillis === "function" ? m.toMillis() : null;
}

/** Real Agency Community member access — single post + comments. Same
 *  access pattern as the feed page (see that file's doc comment). */
export default async function MyAgencyCommunityPostPage({
  params,
}: {
  params: Promise<{ groupId: string; postId: string }>;
}) {
  const { groupId, postId } = await params;

  const person = await getCurrentPerson();
  if (!person) {
    redirect(
      `/my/login?next=${encodeURIComponent(`/my/community/${groupId}/post/${postId}`)}`,
    );
  }

  const agencyId = await resolveFirstAgencyId();
  const group = agencyId ? await getAgencyGroupById(agencyId, groupId) : null;
  if (!agencyId || !group) {
    return (
      <div className="mx-auto max-w-2xl p-8 text-center text-sm text-muted-foreground">
        Community not found.
      </div>
    );
  }

  const membership = await getAgencyMembershipForPerson(agencyId, groupId, person.id);
  if (!membership || membership.status === "removed") {
    return (
      <div className="mx-auto max-w-2xl p-8 text-center text-sm text-muted-foreground">
        You don&apos;t have access to this community.
      </div>
    );
  }
  if (membership.status === "pending") {
    await activateAgencyMembershipServerSide(agencyId, groupId, membership.id);
  }

  const post = await getAgencyPost(agencyId, groupId, postId);
  if (!post) {
    return (
      <div className="mx-auto max-w-2xl p-8 text-center text-sm text-muted-foreground">
        Post not found.
      </div>
    );
  }

  const [comments, likedByViewer, brandName] = await Promise.all([
    listAgencyComments(agencyId, groupId, postId),
    isAgencyPostLikedByViewer(agencyId, groupId, postId, person.id),
    resolveBrandName(),
  ]);

  const clientPost: ClientPost = {
    id: post.id,
    authorMemberId: post.authorMemberId,
    title: post.title,
    body: renderCommunityPostHtml(post.body),
    attachments: post.attachments,
    category: post.category,
    commentsDisabled: post.commentsDisabled,
    pinned: post.pinned,
    pinnedAtMs: toMillis(post.pinnedAt),
    pinnedToChannel: post.pinnedToChannel === true,
    channelPinnedAtMs: toMillis(post.channelPinnedAt),
    likeCount: post.likeCount,
    commentCount: post.commentCount,
    createdAtMs: toMillis(post.createdAt),
    author: {
      memberId: post.authorMemberId,
      displayName: post.authorDisplayName ?? brandName,
      avatarUrl: post.authorAvatarUrl ?? null,
      level: 1,
    },
    likedByViewer,
  };

  const clientComments: ClientComment[] = await Promise.all(
    comments.map(async (c) => ({
      id: c.id,
      body: renderCommunityCommentHtml(c.body),
      likeCount: c.likeCount,
      likedByViewer: await isAgencyCommentLikedByViewer(
        agencyId,
        groupId,
        postId,
        c.id,
        person.id,
      ),
      createdAtMs: toMillis(c.createdAt),
      parentId: c.parentId,
      attachments: c.attachments,
      edited: !!c.editedAt,
      author: {
        memberId: c.authorMemberId,
        displayName: c.authorDisplayName ?? brandName,
        avatarUrl: c.authorAvatarUrl ?? null,
        level: 1,
      },
    })),
  );

  const resolvedTheme = resolveCommunityTheme(group);
  const brand = resolvedTheme.primary || COMMUNITY_DEFAULT_BRAND;
  const viewer = {
    memberId: person.id,
    displayName: agencyMemberDisplayName(membership),
    avatarUrl: null,
    level: 1,
  };

  return (
    <CommunityShell
      saId=""
      agencyGroupId={groupId}
      agencyMemberView
      group={group}
      active="community"
      viewer={viewer}
      viewerIsModerator={false}
      embedded={false}
    >
      <div className="mx-auto max-w-3xl">
        <PostDetailView
          saId=""
          agencyGroupId={groupId}
          agencyMemberView
          groupId={group.id}
          groupSlug={group.slug}
          brand={brand}
          primaryAction={resolvedTheme.primaryAction}
          accent={resolvedTheme.accent}
          communityName={group.name}
          categories={group.categories}
          post={clientPost}
          initialComments={clientComments}
          viewer={{ ...viewer, role: "member" }}
        />
      </div>
    </CommunityShell>
  );
}
