import "server-only";
import { getFeedPost, listComments } from "@/lib/server/community-feed-service";
import {
  renderCommunityPostHtml,
  renderCommunityCommentHtml,
} from "@/lib/community/post-html";
import type { ClientPost } from "@/components/community/feed/feed-view";
import type { ClientComment } from "@/components/community/feed/post-detail-view";

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

/**
 * Shared post-detail data shaping — the exact same transform three separate
 * page.tsx files (member opaque, member pretty, staff) each duplicated
 * inline before this existed: `getFeedPost`+`listComments` (subAccountId/
 * groupId/postId/viewer already resolved by the caller's own access check,
 * which legitimately differs per surface and stays there) into the
 * client-safe shapes those pages render. One transform, one place to fix a
 * field mismatch.
 */
export async function loadCommunityPostDetail(opts: {
  subAccountId: string;
  groupId: string;
  postId: string;
  viewerMemberId: string;
  viewerIsModerator: boolean;
}): Promise<{ post: ClientPost; comments: ClientComment[] } | null> {
  const feedPost = await getFeedPost({
    subAccountId: opts.subAccountId,
    groupId: opts.groupId,
    postId: opts.postId,
    viewerMemberId: opts.viewerMemberId,
    viewerIsModerator: opts.viewerIsModerator,
  });
  if (!feedPost) return null;

  const comments = await listComments({
    subAccountId: opts.subAccountId,
    groupId: opts.groupId,
    postId: opts.postId,
    viewerMemberId: opts.viewerMemberId,
  });

  const post: ClientPost = {
    id: feedPost.id,
    authorMemberId: feedPost.authorMemberId,
    title: feedPost.title,
    // Sanitized server-side before reaching the client — see post-html.ts.
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
    postType: feedPost.postType,
    liveSessionId: feedPost.liveSessionId,
    liveRoomId: feedPost.liveRoomId,
    liveMode: feedPost.liveMode,
    liveStatus: feedPost.liveStatus,
    replayStatus: feedPost.replayStatus,
    replayAssetId: feedPost.replayAssetId,
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

  return { post, comments: clientComments };
}
