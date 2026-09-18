import { NextResponse } from "next/server";
import { AccessToken } from "livekit-server-sdk";
import { livekitConfig } from "@/lib/livekit/config";
import { resolveAgencyCommunityCaller, agencyMemberDisplayName } from "@/lib/server/agency-community-access";
import { getAgencyPost } from "@/lib/server/community-agency-service";
import { getAgencyLiveSessionServerSide } from "@/lib/server/agency-community-live-room-service";

export const dynamic = "force-dynamic";

type RouteParams = { groupId: string; postId: string };

async function getActiveWatchContext(request: Request, { groupId, postId }: RouteParams) {
  const caller = await resolveAgencyCommunityCaller(request, groupId);
  if (caller instanceof NextResponse) return { accessError: caller } as const;
  const post = await getAgencyPost(caller.agencyId, groupId, postId, caller.kind === "owner");
  if (!post || post.postType !== "live" || post.liveStatus !== "live" || !post.liveRoomId || !post.liveSessionId) {
    return null;
  }
  const found = await getAgencyLiveSessionServerSide(caller.agencyId, groupId, post.liveRoomId);
  if (
    !found ||
    !found.room.keepAsPost ||
    found.room.status !== "live" ||
    found.session.status !== "live" ||
    found.room.agencyId !== caller.agencyId ||
    found.room.groupId !== groupId ||
    found.room.communityPostId !== post.id ||
    found.room.liveSessionId !== post.liveSessionId ||
    found.session.id !== post.liveSessionId ||
    found.session.sourceType !== "community" ||
    found.session.sourceId !== found.room.id ||
    found.session.agencyId !== caller.agencyId
  ) {
    return null;
  }
  return { caller, post, found };
}

function inactiveResponse() {
  return NextResponse.json({ error: "Live post is not active" }, { status: 404 });
}

export async function GET(request: Request, { params }: { params: Promise<RouteParams> }) {
  const context = await getActiveWatchContext(request, await params);
  if (context && "accessError" in context) return context.accessError;
  return context ? NextResponse.json({ active: true }) : inactiveResponse();
}

/** A five-minute, subscribe-only token — mirrors the tenant feed-watch
 *  route exactly. The authoritative post read means a room/session id
 *  alone can never reveal a private Agency Community live stage. */
export async function POST(request: Request, { params }: { params: Promise<RouteParams> }) {
  const routeParams = await params;
  const context = await getActiveWatchContext(request, routeParams);
  if (context && "accessError" in context) return context.accessError;
  if (!context) return inactiveResponse();
  const { caller, post, found } = context;
  const viewerId = caller.kind === "owner" ? caller.uid : caller.personId;
  const displayName = caller.kind === "owner" ? "Owner" : agencyMemberDisplayName(caller.membership);
  const { apiKey, apiSecret } = livekitConfig();
  const token = new AccessToken(apiKey, apiSecret, {
    identity: `feed-watch:${viewerId}:${found.session.id}`,
    name: displayName,
    ttl: "5m",
    metadata: JSON.stringify({
      role: "FEED_WATCHER",
      source: "agency_community_feed",
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
