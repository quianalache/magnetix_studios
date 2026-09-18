import { NextResponse } from "next/server";
import { resolveAgencyCommunityCaller } from "@/lib/server/agency-community-access";
import { getAgencyPost } from "@/lib/server/community-agency-service";
import { resolveAgencyReplayUrl } from "@/lib/server/agency-community-live-recording-service";

export const dynamic = "force-dynamic";

/** Agency Community — resolve a short-lived replay URL for a retained live
 *  post. Owner OR an active member of this exact group (enforced by
 *  `resolveAgencyCommunityCaller`) — mirrors the tenant post replay route. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ groupId: string; postId: string }> },
) {
  const { groupId, postId } = await params;
  const caller = await resolveAgencyCommunityCaller(request, groupId);
  if (caller instanceof NextResponse) return caller;

  const post = await getAgencyPost(caller.agencyId, groupId, postId, caller.kind === "owner");
  if (!post?.replayAssetId || post.replayStatus !== "ready") {
    return NextResponse.json({ error: "Replay is unavailable" }, { status: 404 });
  }
  const signed = await resolveAgencyReplayUrl({
    agencyId: caller.agencyId,
    assetId: post.replayAssetId,
    expiresInSeconds: 5 * 60,
  });
  if (!signed) return NextResponse.json({ error: "Replay is unavailable" }, { status: 404 });
  return NextResponse.json({ url: signed.url, expiresAt: signed.expiresAt.toISOString() });
}
