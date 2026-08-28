import { NextResponse } from "next/server";
import { requireGroupApiAccess } from "@/lib/community/member-context";
import {
  createCommentServerSide,
  listComments,
} from "@/lib/server/community-feed-service";
import { getAdminDb } from "@/lib/firebase/admin";
import { aboutPlainTextLength } from "@/lib/community/about-html";
import { normalizeCommentAttachments } from "@/lib/community/normalize-post-attachments";
import { renderCommunityCommentHtml } from "@/lib/community/post-html";

export const dynamic = "force-dynamic";

export async function GET(
  _: Request,
  {
    params,
  }: { params: Promise<{ saId: string; groupId: string; postId: string }> }
) {
  const { saId, groupId, postId } = await params;
  const access = await requireGroupApiAccess(saId, groupId);
  if (access.kind === "error") {
    return NextResponse.json(
      { error: access.message },
      { status: access.status }
    );
  }
  const comments = await listComments({
    subAccountId: saId,
    groupId,
    postId,
    viewerMemberId: access.member.id,
  });
  return NextResponse.json({
    comments: comments.map((comment) => ({
      id: comment.id,
      body: renderCommunityCommentHtml(comment.body),
      parentId: comment.parentId,
      author: comment.author,
    })),
  });
}

/** Member: comment on a post (or reply to a comment/reply — see
 *  createCommentServerSide's resolveCommentParentId for how a reply-to-a-
 *  reply is flattened server-side to the same top-level thread). */
export async function POST(
  request: Request,
  {
    params,
  }: { params: Promise<{ saId: string; groupId: string; postId: string }> }
) {
  const { saId, groupId, postId } = await params;
  const access = await requireGroupApiAccess(saId, groupId);
  if (access.kind === "error") {
    return NextResponse.json(
      { error: access.message },
      { status: access.status }
    );
  }

  // Phase D — the author's "allow comments/replies" toggle is enforced
  // HERE, server-side, not merely by hiding the comment form in the UI
  // (per the explicit instruction: hiding the form is not enough). A post
  // with existing comments keeps them fully visible either way — this
  // only blocks NEW ones.
  const postSnap = await getAdminDb()
    .doc(`subAccounts/${saId}/communityGroups/${groupId}/posts/${postId}`)
    .get();
  if (!postSnap.exists) {
    return NextResponse.json({ error: "Post not found" }, { status: 404 });
  }
  if (postSnap.data()!.commentsDisabled === true) {
    return NextResponse.json(
      { error: "Comments are turned off for this post" },
      { status: 403 }
    );
  }

  let body: { body?: string; parentId?: string | null; attachments?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Comments & Replies (2026-08-19) — `body.body` is real HTML from the
  // (much smaller) comment editor config, not plain text; the length cap
  // must be measured against VISIBLE text, same reasoning already applied
  // to posts (aboutPlainTextLength is a plain regex tag-stripper, reused
  // as-is). An attachment-only comment (no text) is valid, same as an
  // attachment-only post.
  const html = body.body?.trim() ?? "";
  const visibleLength = aboutPlainTextLength(html);
  const attachments = normalizeCommentAttachments(
    body.attachments,
    access.member.id
  );

  if (visibleLength === 0 && attachments.length === 0) {
    return NextResponse.json(
      { error: "Write something, or attach a photo, voice note, or file" },
      { status: 400 }
    );
  }
  if (visibleLength > 5000) {
    return NextResponse.json({ error: "Comment is too long" }, { status: 400 });
  }
  const parentId =
    typeof body.parentId === "string" && body.parentId.trim()
      ? body.parentId.trim()
      : null;

  try {
    const comment = await createCommentServerSide({
      subAccountId: saId,
      groupId,
      postId,
      authorMemberId: access.member.id,
      body: html,
      parentId,
      attachments,
    });
    return NextResponse.json({ ok: true, comment });
  } catch (err) {
    // Thrown by resolveCommentParentId when `parentId` names a comment
    // that doesn't exist (e.g. deleted between page load and submit) —
    // a genuine error, not something to silently reinterpret.
    const message = err instanceof Error ? err.message : "Couldn't comment";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
