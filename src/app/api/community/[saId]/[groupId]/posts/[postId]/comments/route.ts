import { NextResponse } from "next/server";
import { requireGroupApiAccess } from "@/lib/community/member-context";
import { createCommentServerSide } from "@/lib/server/community-feed-service";
import { getAdminDb } from "@/lib/firebase/admin";

export const dynamic = "force-dynamic";

/** Member: comment on a post. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ saId: string; groupId: string; postId: string }> },
) {
  const { saId, groupId, postId } = await params;
  const access = await requireGroupApiAccess(saId, groupId);
  if (access.kind === "error") {
    return NextResponse.json({ error: access.message }, { status: access.status });
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
      { status: 403 },
    );
  }

  let body: { body?: string; parentId?: string | null };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const text = body.body?.trim();
  if (!text) {
    return NextResponse.json({ error: "Write a comment first" }, { status: 400 });
  }
  if (text.length > 5000) {
    return NextResponse.json({ error: "Comment is too long" }, { status: 400 });
  }
  const parentId =
    typeof body.parentId === "string" && body.parentId.trim()
      ? body.parentId.trim()
      : null;

  const comment = await createCommentServerSide({
    subAccountId: saId,
    groupId,
    postId,
    authorMemberId: access.member.id,
    body: text,
    parentId,
  });
  return NextResponse.json({ ok: true, comment });
}
