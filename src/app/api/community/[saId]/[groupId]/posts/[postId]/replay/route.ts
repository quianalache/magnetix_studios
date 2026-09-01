import { NextResponse } from "next/server";
import { requireGroupApiAccess } from "@/lib/community/member-context";
import { getFeedPost } from "@/lib/server/community-feed-service";
import { resolveMediaAssetUrl } from "@/lib/server/media-asset-service";

export const dynamic = "force-dynamic";

export async function GET(
  _: Request,
  {
    params,
  }: { params: Promise<{ saId: string; groupId: string; postId: string }> }
) {
  const { saId, groupId, postId } = await params;
  const access = await requireGroupApiAccess(saId, groupId);
  if (access.kind !== "ok")
    return NextResponse.json(
      { error: access.message },
      { status: access.status }
    );
  const post = await getFeedPost({
    subAccountId: saId,
    groupId,
    postId,
    viewerMemberId: access.member.id,
    viewerIsModerator: access.membership.role === "moderator",
  });
  if (!post?.replayAssetId || post.replayStatus !== "ready")
    return NextResponse.json(
      { error: "Replay is unavailable" },
      { status: 404 }
    );
  const signed = await resolveMediaAssetUrl({
    tenant: { agencyId: access.group.agencyId, subAccountId: saId },
    assetId: post.replayAssetId,
    viewer: {
      kind: "person",
      agencyId: access.group.agencyId,
      subAccountId: saId,
      personId: access.member.id,
      communityGroupIds: [groupId],
    },
    disposition: "inline",
    expiresInSeconds: 5 * 60,
  });
  if (!signed)
    return NextResponse.json(
      { error: "Replay is unavailable" },
      { status: 404 }
    );
  return NextResponse.json({
    url: signed.url,
    expiresAt: signed.expiresAt.toISOString(),
  });
}
