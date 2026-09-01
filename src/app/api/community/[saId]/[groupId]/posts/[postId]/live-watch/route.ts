import { NextResponse } from "next/server";
import { AccessToken } from "livekit-server-sdk";
import { requireGroupApiAccess } from "@/lib/community/member-context";
import { livekitConfig } from "@/lib/livekit/config";
import { getFeedPost } from "@/lib/server/community-feed-service";
import { getCommunityLiveSessionServerSide } from "@/lib/server/community-live-room-service";

export const dynamic = "force-dynamic";

type RouteParams = { saId: string; groupId: string; postId: string };

async function getActiveWatchContext({ saId, groupId, postId }: RouteParams) {
  const access = await requireGroupApiAccess(saId, groupId);
  if (access.kind !== "ok") return { accessError: access } as const;
  const post = await getFeedPost({
    subAccountId: saId,
    groupId,
    postId,
    viewerMemberId: access.member.id,
    viewerIsModerator: access.membership.role === "moderator",
  });
  if (
    !post ||
    post.postType !== "live" ||
    post.liveStatus !== "live" ||
    !post.liveRoomId ||
    !post.liveSessionId
  )
    return null;
  const found = await getCommunityLiveSessionServerSide(
    saId,
    groupId,
    post.liveRoomId
  );
  if (
    !found ||
    !found.room.keepAsPost ||
    found.room.status !== "live" ||
    found.session.status !== "live" ||
    found.room.subAccountId !== saId ||
    found.room.groupId !== groupId ||
    found.room.communityPostId !== post.id ||
    found.room.liveSessionId !== post.liveSessionId ||
    found.session.id !== post.liveSessionId ||
    found.session.sourceType !== "community" ||
    found.session.sourceId !== found.room.id ||
    found.session.subAccountId !== saId
  )
    return null;
  return { access, post, found };
}

function inactiveResponse() {
  return NextResponse.json(
    { error: "Live post is not active" },
    { status: 404 }
  );
}

export async function GET(
  _: Request,
  { params }: { params: Promise<RouteParams> }
) {
  const context = await getActiveWatchContext(await params);
  if (context?.accessError)
    return NextResponse.json(
      { error: context.accessError.message },
      { status: context.accessError.status }
    );
  return context ? NextResponse.json({ active: true }) : inactiveResponse();
}

/** A five-minute, subscribe-only token. The authoritative post read means a
 * room/session id alone can never reveal a private Community live stage. */
export async function POST(
  _: Request,
  { params }: { params: Promise<RouteParams> }
) {
  const routeParams = await params;
  const context = await getActiveWatchContext(routeParams);
  if (context?.accessError)
    return NextResponse.json(
      { error: context.accessError.message },
      { status: context.accessError.status }
    );
  if (!context) return inactiveResponse();
  const { access, post, found } = context;
  const { apiKey, apiSecret } = livekitConfig();
  const token = new AccessToken(apiKey, apiSecret, {
    identity: `feed-watch:${access.member.id}:${found.session.id}`,
    name: access.member.displayName?.trim() || "Community member",
    ttl: "5m",
    metadata: JSON.stringify({
      role: "FEED_WATCHER",
      source: "community-feed",
      sessionId: found.session.id,
      groupId: routeParams.groupId,
      postId: post.id,
    }),
  });
  token.addGrant({
    roomJoin: true,
    room: found.session.providerRoomName,
    canSubscribe: true,
    canPublish: false,
    canPublishData: false,
    canPublishSources: [],
  });
  return NextResponse.json({
    token: await token.toJwt(),
    url: process.env.LIVEKIT_URL,
    mode: found.room.mode,
  });
}
