import "server-only";

import { NextResponse } from "next/server";
import { resolveAgencyCommunityCaller } from "@/lib/server/agency-community-access";
import { resolveBrandName } from "@/lib/landing/resolve-brand";
import {
  getAgencyPost,
  updateAgencyPostServerSide,
  deleteAgencyPostServerSide,
  listAgencyComments,
  isAgencyPostLikedByViewer,
  isAgencyCommentLikedByViewer,
  viewerAgencyPollVotes,
} from "@/lib/server/community-agency-service";
import { buildFeedPoll } from "@/lib/server/community-feed-service";
import { normalizePollDraft } from "@/lib/community/normalize-poll";
import { renderCommunityPostHtml, renderCommunityCommentHtml } from "@/lib/community/post-html";
import type { MediaAttachment } from "@/types/media-attachment";

export const dynamic = "force-dynamic";

function toMillis(v: unknown): number | null {
  const m = v as { toMillis?: () => number } | null;
  return typeof m?.toMillis === "function" ? m.toMillis() : null;
}

/** Agency Community — get one post + its comments. Owner OR an active
 *  member (real access — see agency-community-access.ts). */
export async function GET(
  request: Request,
  ctx: { params: Promise<{ groupId: string; postId: string }> },
) {
  const { groupId, postId } = await ctx.params;
  const caller = await resolveAgencyCommunityCaller(request, groupId);
  if (caller instanceof NextResponse) return caller;
  const viewerId = caller.kind === "owner" ? caller.uid : caller.personId;
  const isModerator = caller.kind === "owner";

  const post = await getAgencyPost(caller.agencyId, groupId, postId, isModerator);
  if (!post) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [likedByViewer, comments, brandName, pollVotes] = await Promise.all([
    isAgencyPostLikedByViewer(caller.agencyId, groupId, postId, viewerId),
    listAgencyComments(caller.agencyId, groupId, postId),
    resolveBrandName(),
    post.poll
      ? viewerAgencyPollVotes(caller.agencyId, groupId, [postId], viewerId)
      : Promise.resolve(new Map<string, string[]>()),
  ]);

  const clientPost = {
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
    poll: post.poll ? buildFeedPoll(post.poll, pollVotes.get(postId) ?? null, isModerator) : undefined,
  };

  const clientComments = await Promise.all(
    comments.map(async (c) => ({
      id: c.id,
      body: renderCommunityCommentHtml(c.body),
      likeCount: c.likeCount,
      likedByViewer: await isAgencyCommentLikedByViewer(
        caller.agencyId,
        groupId,
        postId,
        c.id,
        viewerId,
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

  return NextResponse.json({ post: clientPost, comments: clientComments });
}

/**
 * Agency Community — update (edit/pin) or delete a post. Owner can act on
 * ANY post (unrestricted, same as before). A member may only edit/delete
 * their OWN post (`authorMemberId === personId`) and may NOT pin — pinning
 * is a moderation action, owner-only. This is a NEW ownership check: until
 * now this route trusted every caller completely because only the owner
 * could ever reach it.
 */
export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ groupId: string; postId: string }> },
) {
  const { groupId, postId } = await ctx.params;
  const caller = await resolveAgencyCommunityCaller(request, groupId);
  if (caller instanceof NextResponse) return caller;

  if (caller.kind === "member") {
    const existing = await getAgencyPost(caller.agencyId, groupId, postId);
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (existing.authorMemberId !== caller.personId) {
      return NextResponse.json({ error: "You can only edit your own post" }, { status: 403 });
    }
  }

  let body: {
    title?: string;
    body?: string;
    category?: string | null;
    attachments?: MediaAttachment[];
    commentsDisabled?: boolean;
    pinned?: boolean;
    pinTarget?: "allPosts" | "channel";
    poll?: unknown;
    // The feed's "change channel" action re-submits the post's existing
    // fields wrapped in `edit` — same shape the tenant route accepts.
    edit?: {
      title?: string;
      body?: string;
      category?: string | null;
      attachments?: MediaAttachment[];
      commentsDisabled?: boolean;
      poll?: unknown;
    };
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Pinning is a moderation action — never available to a member editing
  // their own post, even though they're allowed past the ownership check
  // above for everything else.
  if (caller.kind === "member" && body.pinned !== undefined) {
    return NextResponse.json({ error: "Only the owner can pin posts" }, { status: 403 });
  }

  const patch = body.edit ?? body;
  const pollRaw = patch.poll;
  if (pollRaw !== undefined && caller.kind === "member") {
    return NextResponse.json({ error: "Only the owner can manage a poll" }, { status: 403 });
  }
  let poll: ReturnType<typeof normalizePollDraft> | undefined;
  if (pollRaw !== undefined) {
    try {
      poll = pollRaw === null ? null : normalizePollDraft(pollRaw);
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Invalid poll" },
        { status: 400 },
      );
    }
  }

  try {
    const post = await updateAgencyPostServerSide(caller.agencyId, groupId, postId, {
      title: patch.title,
      body: patch.body,
      category: patch.category,
      attachments: patch.attachments,
      commentsDisabled: patch.commentsDisabled,
      pinned: body.pinned,
      pinTarget: body.pinTarget,
      poll,
    });
    return NextResponse.json({ ok: true, post });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Couldn't update post" },
      { status: 400 },
    );
  }
}

/** Delete a post. Owner can delete any post; a member may only delete
 *  their own. */
export async function DELETE(
  request: Request,
  ctx: { params: Promise<{ groupId: string; postId: string }> },
) {
  const { groupId, postId } = await ctx.params;
  const caller = await resolveAgencyCommunityCaller(request, groupId);
  if (caller instanceof NextResponse) return caller;

  if (caller.kind === "member") {
    const existing = await getAgencyPost(caller.agencyId, groupId, postId);
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (existing.authorMemberId !== caller.personId) {
      return NextResponse.json({ error: "You can only delete your own post" }, { status: 403 });
    }
  }

  await deleteAgencyPostServerSide(caller.agencyId, groupId, postId);
  return NextResponse.json({ ok: true });
}
