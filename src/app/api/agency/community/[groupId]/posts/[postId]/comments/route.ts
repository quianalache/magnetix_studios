import "server-only";

import { NextResponse } from "next/server";
import { requireAgencyOwnerAny } from "@/lib/auth/require-tenancy";
import { createAgencyCommentServerSide } from "@/lib/server/community-agency-service";
import type { MediaAttachment } from "@/types/media-attachment";

export const dynamic = "force-dynamic";

/** Agency Community — create a comment/reply. Owner-only. */
export async function POST(
  request: Request,
  ctx: { params: Promise<{ groupId: string; postId: string }> },
) {
  const caller = await requireAgencyOwnerAny(request);
  if (caller instanceof NextResponse) return caller;
  const { groupId, postId } = await ctx.params;

  let body: {
    body?: string;
    parentId?: string | null;
    attachments?: MediaAttachment[];
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const text = (body.body ?? "").trim();
  const attachments = body.attachments ?? [];
  if (!text && attachments.length === 0) {
    return NextResponse.json({ error: "Write something first." }, { status: 400 });
  }

  const comment = await createAgencyCommentServerSide({
    agencyId: caller.agencyId!,
    groupId,
    postId,
    authorUid: caller.uid,
    body: body.body ?? "",
    parentId: body.parentId,
    attachments,
  });
  return NextResponse.json({ ok: true, comment });
}
