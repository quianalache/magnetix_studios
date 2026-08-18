import { NextResponse } from "next/server";
import { requireGroupApiAccess } from "@/lib/community/member-context";
import {
  deletePostServerSide,
  setPinnedServerSide,
  updatePostServerSide,
} from "@/lib/server/community-feed-service";
import { getGroupById } from "@/lib/server/community-service";
import { getAdminDb } from "@/lib/firebase/admin";
import { aboutPlainTextLength } from "@/lib/community/about-html";
import { normalizePostAttachments } from "@/lib/community/normalize-post-attachments";

export const dynamic = "force-dynamic";

/**
 * Member (moderator): pin / unpin a post — `{ pinned: boolean }`.
 * Member (author or moderator): edit a post — `{ edit: {...} }`. Two
 * distinct request shapes on the same PATCH endpoint (not two routes)
 * because they're both "partial update a post" in REST terms; kept as
 * separate top-level keys specifically so they can never be confused with
 * each other or accidentally merged, and so the existing pin call site
 * (feed-view.tsx/post-detail-view.tsx, unchanged) needed zero changes.
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
    edit?: {
      title?: string;
      body?: string;
      category?: string | null;
      attachments?: unknown;
      commentsDisabled?: boolean;
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

    const html = body.edit.body?.trim() ?? "";
    const visibleLength = aboutPlainTextLength(html);
    const attachments = normalizePostAttachments(body.edit.attachments, access.member.id);

    if (visibleLength === 0 && attachments.length === 0) {
      return NextResponse.json(
        { error: "Write something, or attach a photo or voice note" },
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

    const post = await updatePostServerSide({
      subAccountId: saId,
      groupId,
      postId,
      title: body.edit.title?.trim() ?? "",
      body: html,
      attachments,
      category,
      commentsDisabled: body.edit.commentsDisabled === true,
    });
    if (!post) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, post });
  }

  // Pin/unpin — unchanged from Phase C, moderator-only.
  if (access.membership.role !== "moderator") {
    return NextResponse.json({ error: "Moderators only" }, { status: 403 });
  }
  await setPinnedServerSide({
    subAccountId: saId,
    groupId,
    postId,
    pinned: body.pinned === true,
  });
  return NextResponse.json({ ok: true, pinned: body.pinned === true });
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
