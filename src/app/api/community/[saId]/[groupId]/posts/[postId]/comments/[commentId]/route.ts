import { NextResponse } from "next/server";
import { requireGroupApiAccess } from "@/lib/community/member-context";
import {
  deleteCommentServerSide,
  getCommentAuthor,
  updateCommentServerSide,
} from "@/lib/server/community-feed-service";
import { aboutPlainTextLength } from "@/lib/community/about-html";
import { normalizeCommentAttachments } from "@/lib/community/normalize-post-attachments";

export const dynamic = "force-dynamic";

/**
 * Member: edit OWN comment/reply — author only, deliberately never
 * moderator (a moderator may delete another member's comment below, but
 * must never rewrite what they said — see the Comments & Replies report
 * for why this is a hard product boundary, not an oversight). Enforced
 * here server-side, not merely by hiding the "Edit" menu item — the same
 * discipline as every other permission check in this codebase.
 */
export async function PATCH(
  request: Request,
  {
    params,
  }: {
    params: Promise<{
      saId: string;
      groupId: string;
      postId: string;
      commentId: string;
    }>;
  },
) {
  const { saId, groupId, postId, commentId } = await params;
  const access = await requireGroupApiAccess(saId, groupId);
  if (access.kind === "error") {
    return NextResponse.json({ error: access.message }, { status: access.status });
  }

  const authorId = await getCommentAuthor({ subAccountId: saId, groupId, postId, commentId });
  if (!authorId) {
    return NextResponse.json({ error: "Comment not found" }, { status: 404 });
  }
  if (authorId !== access.member.id) {
    return NextResponse.json(
      { error: "You can only edit your own comments" },
      { status: 403 },
    );
  }

  let body: { body?: string; attachments?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const html = body.body?.trim() ?? "";
  const visibleLength = aboutPlainTextLength(html);
  const attachments = normalizeCommentAttachments(body.attachments, access.member.id);

  if (visibleLength === 0 && attachments.length === 0) {
    return NextResponse.json(
      { error: "Write something, or attach a photo, voice note, or file" },
      { status: 400 },
    );
  }
  if (visibleLength > 5000) {
    return NextResponse.json({ error: "Comment is too long" }, { status: 400 });
  }

  const result = await updateCommentServerSide({
    subAccountId: saId,
    groupId,
    postId,
    commentId,
    body: html,
    attachments,
  });
  if (!result.ok) {
    return NextResponse.json({ error: "Comment not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, body: result.sanitizedBody });
}

/** Member: delete a comment (its author) or moderator. */
export async function DELETE(
  request: Request,
  {
    params,
  }: {
    params: Promise<{
      saId: string;
      groupId: string;
      postId: string;
      commentId: string;
    }>;
  },
) {
  const { saId, groupId, postId, commentId } = await params;
  const access = await requireGroupApiAccess(saId, groupId);
  if (access.kind === "error") {
    return NextResponse.json({ error: access.message }, { status: access.status });
  }

  const authorId = await getCommentAuthor({
    subAccountId: saId,
    groupId,
    postId,
    commentId,
  });
  if (!authorId) {
    return NextResponse.json({ error: "Comment not found" }, { status: 404 });
  }
  const isAuthor = authorId === access.member.id;
  if (!isAuthor && access.membership.role !== "moderator") {
    return NextResponse.json(
      { error: "You can only delete your own comments" },
      { status: 403 },
    );
  }

  await deleteCommentServerSide({ subAccountId: saId, groupId, postId, commentId });
  return NextResponse.json({ ok: true });
}
