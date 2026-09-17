import "server-only";

import { NextResponse } from "next/server";
import {
  resolveAgencyCommunityCaller,
  agencyMemberDisplayName,
} from "@/lib/server/agency-community-access";
import { createAgencyCommentServerSide } from "@/lib/server/community-agency-service";
import type { MediaAttachment } from "@/types/media-attachment";

export const dynamic = "force-dynamic";

/** Agency Community — create a comment/reply. Owner OR an active member of
 *  THIS specific community (real access — see agency-community-access.ts). */
export async function POST(
  request: Request,
  ctx: { params: Promise<{ groupId: string; postId: string }> },
) {
  const { groupId, postId } = await ctx.params;
  const caller = await resolveAgencyCommunityCaller(request, groupId);
  if (caller instanceof NextResponse) return caller;

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
    agencyId: caller.agencyId,
    groupId,
    postId,
    author:
      caller.kind === "owner"
        ? { kind: "owner", uid: caller.uid }
        : {
            kind: "member",
            personId: caller.personId,
            displayName: agencyMemberDisplayName(caller.membership),
          },
    body: body.body ?? "",
    parentId: body.parentId,
    attachments,
  });
  return NextResponse.json({ ok: true, comment });
}
