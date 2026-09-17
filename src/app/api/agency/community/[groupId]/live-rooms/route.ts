import { NextResponse } from "next/server";
import { AccessToken, TrackSource } from "livekit-server-sdk";
import { livekitConfig } from "@/lib/livekit/config";
import { resolveAgencyCommunityCaller, agencyMemberDisplayName } from "@/lib/server/agency-community-access";
import { resolveLiveParticipantIdentityServerSide } from "@/lib/server/live-session-identity-service";
import { rolePermissions } from "@/lib/server/live-session-service";
import { resolveBrandName } from "@/lib/landing/resolve-brand";
import { getAgencyChannelByName, getAgencyInaccessibleChannelNames } from "@/lib/server/community-agency-service";
import {
  createAgencyLiveRoomServerSide,
  endAgencyLiveRoomServerSide,
  getAgencyLiveSessionServerSide,
  listAgencyLiveRoomsServerSide,
} from "@/lib/server/agency-community-live-room-service";

export const dynamic = "force-dynamic";

/** List active Agency Community live rooms. Owner OR an active member. */
export async function GET(request: Request, ctx: { params: Promise<{ groupId: string }> }) {
  const { groupId } = await ctx.params;
  const caller = await resolveAgencyCommunityCaller(request, groupId);
  if (caller instanceof NextResponse) return caller;
  const rooms = await listAgencyLiveRoomsServerSide(caller.agencyId, groupId);
  return NextResponse.json({ rooms });
}

/** Create ("action":"create", owner-only) or join (any active member) a
 *  live room. Mirrors the tenant route's action-dispatch shape. */
export async function POST(request: Request, ctx: { params: Promise<{ groupId: string }> }) {
  const { groupId } = await ctx.params;
  const caller = await resolveAgencyCommunityCaller(request, groupId);
  if (caller instanceof NextResponse) return caller;
  const isModerator = caller.kind === "owner";

  let body: {
    action?: string;
    roomId?: string;
    title?: string;
    description?: string;
    mode?: "meeting" | "broadcast";
    channel?: string | null;
    keepAsPost?: boolean;
    thumbnailUrl?: string | null;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (body.action === "create") {
    if (!isModerator) return NextResponse.json({ error: "Owner access required" }, { status: 403 });
    if (!body.title?.trim()) return NextResponse.json({ error: "Title is required" }, { status: 400 });
    const channel = body.channel?.trim() || null;
    if (channel && !(await getAgencyChannelByName(caller.agencyId, groupId, channel))) {
      return NextResponse.json({ error: "Selected channel was not found" }, { status: 400 });
    }
    const room = await createAgencyLiveRoomServerSide({
      agencyId: caller.agencyId,
      groupId,
      author: { kind: "owner", uid: caller.uid },
      title: body.title,
      description: body.description,
      mode: body.mode === "broadcast" ? "broadcast" : "meeting",
      channel,
      keepAsPost: body.keepAsPost !== false,
      thumbnailUrl: typeof body.thumbnailUrl === "string" ? body.thumbnailUrl : null,
    });
    return NextResponse.json({ room }, { status: 201 });
  }

  if (!body.roomId) return NextResponse.json({ error: "Room is required" }, { status: 400 });
  const found = await getAgencyLiveSessionServerSide(caller.agencyId, groupId, body.roomId);
  if (!found || found.room.status !== "live" || found.session.status !== "live") {
    return NextResponse.json({ error: "Live room is not active" }, { status: 404 });
  }

  if (!isModerator && found.room.channel) {
    const inaccessible = await getAgencyInaccessibleChannelNames({
      agencyId: caller.agencyId,
      groupId,
      isModerator: false,
    });
    const channel = await getAgencyChannelByName(caller.agencyId, groupId, found.room.channel);
    if (inaccessible.has(found.room.channel) || channel?.private) {
      return NextResponse.json({ error: "You don't have access to this channel" }, { status: 403 });
    }
  }

  const role = isModerator ? "HOST" : found.room.mode === "broadcast" ? "VIEWER" : "ATTENDEE";
  const identityId = caller.kind === "owner" ? caller.uid : caller.personId;
  const displayName = isModerator ? await resolveBrandName() : agencyMemberDisplayName(caller.membership);
  const identity = await resolveLiveParticipantIdentityServerSide({
    uid: identityId,
    email: caller.kind === "member" ? caller.email : undefined,
    displayName,
    sessionId: found.session.id,
  });
  const { apiKey, apiSecret } = livekitConfig();
  const permissions = rolePermissions(role);
  const token = new AccessToken(apiKey, apiSecret, {
    identity: identity.stableIdentity,
    name: identity.displayName,
    ttl: "10m",
    metadata: JSON.stringify({ role, source: "agency_community", sessionId: found.session.id, groupId }),
  });
  token.addGrant({
    roomJoin: true,
    room: found.session.providerRoomName,
    ...permissions,
    canPublishSources: permissions.canPublish
      ? [TrackSource.CAMERA, TrackSource.MICROPHONE, TrackSource.SCREEN_SHARE]
      : [],
  });
  return NextResponse.json({
    token: await token.toJwt(),
    url: process.env.LIVEKIT_URL,
    room: found.session.providerRoomName,
    sessionId: found.session.id,
    role,
    displayName: identity.displayName,
    title: found.room.title,
    mode: found.room.mode,
    communityPostId: found.room.communityPostId,
  });
}

/** End a live room. Owner-only. */
export async function DELETE(request: Request, ctx: { params: Promise<{ groupId: string }> }) {
  const { groupId } = await ctx.params;
  const caller = await resolveAgencyCommunityCaller(request, groupId);
  if (caller instanceof NextResponse) return caller;
  if (caller.kind !== "owner") {
    return NextResponse.json({ error: "Owner access required" }, { status: 403 });
  }
  const roomId = new URL(request.url).searchParams.get("roomId");
  if (!roomId) return NextResponse.json({ error: "Room is required" }, { status: 400 });
  const ended = await endAgencyLiveRoomServerSide(caller.agencyId, groupId, roomId);
  return ended ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Room not found" }, { status: 404 });
}
