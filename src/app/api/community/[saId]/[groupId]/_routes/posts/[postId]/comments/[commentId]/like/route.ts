import { NextResponse } from "next/server";
import { requireGroupApiAccess } from "@/lib/community/member-context";
import { viewerCanAccessPost } from "@/lib/server/community-feed-service";
import { toggleLikeServerSide } from "@/lib/server/community-feed-service";

export const dynamic = "force-dynamic";

/** Member: toggle a like on a comment. */
export async function POST(
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
  if (
    !(await viewerCanAccessPost({
      subAccountId: saId,
      groupId,
      postId,
      memberId: access.member.id,
      isModerator: access.membership.role === "moderator",
    }))
  ) {
    return NextResponse.json({ error: "Post not found" }, { status: 404 });
  }
  try {
    const result = await toggleLikeServerSide({
      subAccountId: saId,
      groupId,
      postId,
      commentId,
      viewerMemberId: access.member.id,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch {
    return NextResponse.json({ error: "Comment not found" }, { status: 404 });
  }
}
