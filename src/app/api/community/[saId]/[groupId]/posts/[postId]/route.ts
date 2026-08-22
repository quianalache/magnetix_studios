import { NextResponse } from "next/server";
import { requireGroupApiAccess } from "@/lib/community/member-context";
import {
  deletePostServerSide,
  setPostPinServerSide,
  updatePostServerSide,
  buildFeedPoll,
  viewerPollVotes,
  MaxFeaturedPostsError,
} from "@/lib/server/community-feed-service";
import { getGroupById } from "@/lib/server/community-service";
import { getAdminDb } from "@/lib/firebase/admin";
import { aboutPlainTextLength } from "@/lib/community/about-html";
import { normalizePostAttachments } from "@/lib/community/normalize-post-attachments";
import { normalizePollEdit } from "@/lib/community/normalize-poll";
import { getInaccessibleChannelNames } from "@/lib/server/community-channels-service";
import type { CommunityPost } from "@/types/community";

export const dynamic = "force-dynamic";

/**
 * Member (moderator): pin / unpin a post — `{ pinned: boolean, pinTarget?:
 * "allPosts" | "channel" }`. `pinTarget` defaults to `"allPosts"` so any
 * older call site that only ever sends `{ pinned }` keeps targeting the
 * same community-wide Featured Posts state it always did.
 * Member (author or moderator): edit a post — `{ edit: {...} }`. Two
 * distinct request shapes on the same PATCH endpoint (not two routes)
 * because they're both "partial update a post" in REST terms; kept as
 * separate top-level keys specifically so they can never be confused with
 * each other or accidentally merged.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ saId: string; groupId: string; postId: string }> },
) {
  const { saId, groupId, postId } = await params;
  const access = await requireGroupApiAccess(saId, groupId);
  if (access.kind === "error") {
    return NextResponse.json({ error: access.message }, { status: access.status });
  }

  let body: {
    pinned?: boolean;
    pinTarget?: "allPosts" | "channel";
    edit?: {
      title?: string;
      body?: string;
      category?: string | null;
      attachments?: unknown;
      commentsDisabled?: boolean;
      /** `undefined` = leave the existing poll untouched; `null` = remove
       *  it; an object = create/replace it. See `normalizePollEdit`. */
      poll?: unknown;
    };
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (body.edit) {
    // Author may edit their own post; moderators may edit any post in
    // their group — the SAME broad permission `canDelete` already grants
    // moderators on the client (feed-view.tsx/post-detail-view.tsx), the
    // existing convention for "moderator can act on any post" in this
    // codebase, not a new role concept.
    const postRef = getAdminDb().doc(
      `subAccounts/${saId}/communityGroups/${groupId}/posts/${postId}`,
    );
    const snap = await postRef.get();
    if (!snap.exists) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }
    const isAuthor = snap.data()!.authorMemberId === access.member.id;
    if (!isAuthor && access.membership.role !== "moderator") {
      return NextResponse.json(
        { error: "You can only edit your own posts" },
        { status: 403 },
      );
    }

    const existing = snap.data() as CommunityPost;

    // Polls (2026-08-20) — same moderator-only boundary as creation,
    // checked HERE even though `isAuthor` may already be true: a poll's
    // existence is a moderator decision, not a plain post-ownership one
    // (an author editing their OWN post still can't add/change a poll
    // unless they're also a moderator).
    if (body.edit.poll !== undefined && access.membership.role !== "moderator") {
      return NextResponse.json({ error: "Only moderators can change a poll" }, { status: 403 });
    }
    let poll: ReturnType<typeof normalizePollEdit>;
    try {
      poll = normalizePollEdit(body.edit.poll, existing.poll);
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Invalid poll" },
        { status: 400 },
      );
    }

    // Title is REQUIRED (composer correction pass) — same rule/reasoning
    // as the create route; enforced here too since editing goes through
    // this separate route, not through createPostServerSide.
    const title = body.edit.title?.trim() ?? "";
    if (!title) {
      return NextResponse.json({ error: "A post needs a title" }, { status: 400 });
    }

    const html = body.edit.body?.trim() ?? "";
    const visibleLength = aboutPlainTextLength(html);
    const attachments = normalizePostAttachments(body.edit.attachments, access.member.id);
    const effectivePoll = poll === undefined ? existing.poll : poll;

    if (visibleLength === 0 && attachments.length === 0 && !effectivePoll) {
      return NextResponse.json(
        { error: "Write something, attach a photo or voice note, or add a poll" },
        { status: 400 },
      );
    }
    if (visibleLength > 10000) {
      return NextResponse.json({ error: "Post is too long" }, { status: 400 });
    }

    const category =
      body.edit.category && access.group.categories.includes(body.edit.category)
        ? body.edit.category
        : null;

    // Private-channel access — server-side regardless of the composer's
    // own channel selector. Deliberately NOT checking Read Only here:
    // that rule is specifically about creating a NEW top-level post
    // (Part "Read Only Channel"), not about an author continuing to edit
    // a post they already legitimately created.
    const isModerator = access.membership.role === "moderator";
    if (category && !isModerator) {
      const inaccessible = await getInaccessibleChannelNames({
        subAccountId: saId,
        groupId,
        isModerator,
      });
      if (inaccessible.has(category)) {
        return NextResponse.json({ error: "You don't have access to this channel" }, { status: 403 });
      }
    }

    const post = await updatePostServerSide({
      subAccountId: saId,
      groupId,
      postId,
      title,
      body: html,
      attachments,
      category,
      commentsDisabled: body.edit.commentsDisabled === true,
      poll,
    });
    if (!post) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }
    // Same fix as the create route — `updatePostServerSide` returns the
    // raw stored poll, not a viewer-safe `FeedPoll`. Only a moderator can
    // ever reach this branch with a poll change, so `resultsVisible`/
    // `canManage` are always true; unlike create, an edit CAN happen on a
    // poll the editing moderator already voted on themselves, so their
    // own vote is looked up for real rather than assumed empty.
    let responsePoll: ReturnType<typeof buildFeedPoll> | undefined;
    if (post.poll) {
      const votes = await viewerPollVotes(saId, groupId, [postId], access.member.id);
      responsePoll = buildFeedPoll(post.poll, votes.get(postId) ?? null, true);
    }
    return NextResponse.json({ ok: true, post: { ...post, poll: responsePoll } });
  }

  // Pin/unpin — moderator-only, both targets.
  if (access.membership.role !== "moderator") {
    return NextResponse.json({ error: "Moderators only" }, { status: 403 });
  }
  const pinTarget = body.pinTarget === "channel" ? "channel" : "allPosts";
  try {
    await setPostPinServerSide({
      subAccountId: saId,
      groupId,
      postId,
      target: pinTarget,
      pinned: body.pinned === true,
      actorMemberId: access.member.id,
    });
  } catch (err) {
    if (err instanceof MaxFeaturedPostsError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    const message = err instanceof Error ? err.message : "Couldn't update pin";
    const status = message === "Post not found" ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
  return NextResponse.json({ ok: true, pinned: body.pinned === true, pinTarget });
}

/** Member: delete a post (author) or moderator. */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ saId: string; groupId: string; postId: string }> },
) {
  const { saId, groupId, postId } = await params;
  const access = await requireGroupApiAccess(saId, groupId);
  if (access.kind === "error") {
    return NextResponse.json({ error: access.message }, { status: access.status });
  }

  // Confirm the group still resolves (defensive) + read the post author.
  await getGroupById(saId, groupId);
  const snap = await getAdminDb()
    .doc(`subAccounts/${saId}/communityGroups/${groupId}/posts/${postId}`)
    .get();
  if (!snap.exists) {
    return NextResponse.json({ error: "Post not found" }, { status: 404 });
  }
  const isAuthor = snap.data()!.authorMemberId === access.member.id;
  if (!isAuthor && access.membership.role !== "moderator") {
    return NextResponse.json(
      { error: "You can only delete your own posts" },
      { status: 403 },
    );
  }

  await deletePostServerSide({ subAccountId: saId, groupId, postId });
  return NextResponse.json({ ok: true });
}
