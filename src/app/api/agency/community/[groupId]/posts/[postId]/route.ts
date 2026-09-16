import "server-only";

import { NextResponse } from "next/server";
import { requireAgencyOwnerAny } from "@/lib/auth/require-tenancy";
import {
  getAgencyPost,
  updateAgencyPostServerSide,
  deleteAgencyPostServerSide,
  listAgencyComments,
  isAgencyPostLikedByViewer,
  isAgencyCommentLikedByViewer,
} from "@/lib/server/community-agency-service";
import { renderCommunityPostHtml, renderCommunityCommentHtml } from "@/lib/community/post-html";
import type { MediaAttachment } from "@/types/media-attachment";

export const dynamic = "force-dynamic";

function toMillis(v: unknown): number | null {
  const m = v as { toMillis?: () => number } | null;
  return typeof m?.toMillis === "function" ? m.toMillis() : null;
}

/** Agency Community — get one post + its comments. Owner-only. */
export async function GET(
  request: Request,
  ctx: { params: Promise<{ groupId: string; postId: string }> },
) {
  const caller = await requireAgencyOwnerAny(request);
  if (caller instanceof NextResponse) return caller;
  const { groupId, postId } = await ctx.params;

  const post = await getAgencyPost(caller.agencyId!, groupId, postId);
  if (!post) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [likedByViewer, comments] = await Promise.all([
    isAgencyPostLikedByViewer(caller.agencyId!, groupId, postId, caller.uid),
    listAgencyComments(caller.agencyId!, groupId, postId),
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
      displayName: post.authorDisplayName ?? "Agency owner",
      avatarUrl: post.authorAvatarUrl ?? null,
      level: 1,
    },
    likedByViewer,
  };

  const clientComments = await Promise.all(
    comments.map(async (c) => ({
      id: c.id,
      body: renderCommunityCommentHtml(c.body),
      likeCount: c.likeCount,
      likedByViewer: await isAgencyCommentLikedByViewer(
        caller.agencyId!,
        groupId,
        postId,
        c.id,
        caller.uid,
      ),
      createdAtMs: toMillis(c.createdAt),
      parentId: c.parentId,
      attachments: c.attachments,
      edited: !!c.editedAt,
      author: {
        memberId: c.authorMemberId,
        displayName: c.authorDisplayName ?? "Agency owner",
        avatarUrl: c.authorAvatarUrl ?? null,
        level: 1,
      },
    })),
  );

  return NextResponse.json({ post: clientPost, comments: clientComments });
}

/** Agency Community — update (edit/pin) or delete a post. Owner-only. */
export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ groupId: string; postId: string }> },
) {
  const caller = await requireAgencyOwnerAny(request);
  if (caller instanceof NextResponse) return caller;
  const { groupId, postId } = await ctx.params;

  let body: {
    title?: string;
    body?: string;
    category?: string | null;
    attachments?: MediaAttachment[];
    commentsDisabled?: boolean;
    pinned?: boolean;
    pinTarget?: "allPosts" | "channel";
    // The feed's "change channel" action re-submits the post's existing
    // fields wrapped in `edit` — same shape the tenant route accepts.
    edit?: {
      title?: string;
      body?: string;
      category?: string | null;
      attachments?: MediaAttachment[];
      commentsDisabled?: boolean;
    };
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const patch = body.edit ?? body;
  try {
    const post = await updateAgencyPostServerSide(caller.agencyId!, groupId, postId, {
      title: patch.title,
      body: patch.body,
      category: patch.category,
      attachments: patch.attachments,
      commentsDisabled: patch.commentsDisabled,
      pinned: body.pinned,
      pinTarget: body.pinTarget,
    });
    return NextResponse.json({ ok: true, post });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Couldn't update post" },
      { status: 400 },
    );
  }
}

export async function DELETE(
  request: Request,
  ctx: { params: Promise<{ groupId: string; postId: string }> },
) {
  const caller = await requireAgencyOwnerAny(request);
  if (caller instanceof NextResponse) return caller;
  const { groupId, postId } = await ctx.params;

  await deleteAgencyPostServerSide(caller.agencyId!, groupId, postId);
  return NextResponse.json({ ok: true });
}
