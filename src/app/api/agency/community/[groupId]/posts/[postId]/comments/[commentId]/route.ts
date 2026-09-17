import "server-only";

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { resolveAgencyCommunityCaller } from "@/lib/server/agency-community-access";
import {
  updateAgencyCommentServerSide,
  deleteAgencyCommentServerSide,
} from "@/lib/server/community-agency-service";
import type { MediaAttachment } from "@/types/media-attachment";

export const dynamic = "force-dynamic";

async function getCommentAuthor(
  agencyId: string,
  groupId: string,
  postId: string,
  commentId: string,
): Promise<string | null> {
  const snap = await getAdminDb()
    .doc(
      `agencies/${agencyId}/communityGroups/${groupId}/posts/${postId}/comments/${commentId}`,
    )
    .get();
  if (!snap.exists) return null;
  return (snap.data()?.authorMemberId as string | undefined) ?? null;
}

/** Agency Community — edit a comment. Owner can edit any comment; a
 *  member may only edit their own. */
export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ groupId: string; postId: string; commentId: string }> },
) {
  const { groupId, postId, commentId } = await ctx.params;
  const caller = await resolveAgencyCommunityCaller(request, groupId);
  if (caller instanceof NextResponse) return caller;

  if (caller.kind === "member") {
    const authorId = await getCommentAuthor(caller.agencyId, groupId, postId, commentId);
    if (authorId === null) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (authorId !== caller.personId) {
      return NextResponse.json({ error: "You can only edit your own comment" }, { status: 403 });
    }
  }

  let body: { body?: string; attachments?: MediaAttachment[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const comment = await updateAgencyCommentServerSide(
    caller.agencyId,
    groupId,
    postId,
    commentId,
    body,
  );
  return NextResponse.json({ ok: true, comment });
}

/** Delete a comment. Owner can delete any comment; a member may only
 *  delete their own. */
export async function DELETE(
  request: Request,
  ctx: { params: Promise<{ groupId: string; postId: string; commentId: string }> },
) {
  const { groupId, postId, commentId } = await ctx.params;
  const caller = await resolveAgencyCommunityCaller(request, groupId);
  if (caller instanceof NextResponse) return caller;

  if (caller.kind === "member") {
    const authorId = await getCommentAuthor(caller.agencyId, groupId, postId, commentId);
    if (authorId === null) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (authorId !== caller.personId) {
      return NextResponse.json({ error: "You can only delete your own comment" }, { status: 403 });
    }
  }

  await deleteAgencyCommentServerSide(caller.agencyId, groupId, postId, commentId);
  return NextResponse.json({ ok: true });
}
