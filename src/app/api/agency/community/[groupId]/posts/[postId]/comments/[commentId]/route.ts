import "server-only";

import { NextResponse } from "next/server";
import { requireAgencyOwnerAny } from "@/lib/auth/require-tenancy";
import {
  updateAgencyCommentServerSide,
  deleteAgencyCommentServerSide,
} from "@/lib/server/community-agency-service";
import type { MediaAttachment } from "@/types/media-attachment";

export const dynamic = "force-dynamic";

/** Agency Community — edit/delete a comment. Owner-only. */
export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ groupId: string; postId: string; commentId: string }> },
) {
  const caller = await requireAgencyOwnerAny(request);
  if (caller instanceof NextResponse) return caller;
  const { groupId, postId, commentId } = await ctx.params;

  let body: { body?: string; attachments?: MediaAttachment[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const comment = await updateAgencyCommentServerSide(
    caller.agencyId!,
    groupId,
    postId,
    commentId,
    body,
  );
  return NextResponse.json({ ok: true, comment });
}

export async function DELETE(
  request: Request,
  ctx: { params: Promise<{ groupId: string; postId: string; commentId: string }> },
) {
  const caller = await requireAgencyOwnerAny(request);
  if (caller instanceof NextResponse) return caller;
  const { groupId, postId, commentId } = await ctx.params;

  await deleteAgencyCommentServerSide(caller.agencyId!, groupId, postId, commentId);
  return NextResponse.json({ ok: true });
}
