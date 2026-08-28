import { NextResponse } from "next/server";
import { AccessToken, TrackSource } from "livekit-server-sdk";
import { livekitConfig } from "@/lib/livekit/config";
import { requireGroupApiAccess } from "@/lib/community/member-context";
import { resolveLiveParticipantIdentityServerSide } from "@/lib/server/live-session-identity-service";
import { rolePermissions } from "@/lib/server/live-session-service";
import {
  getChannelByName,
  getInaccessibleChannelNames,
} from "@/lib/server/community-channels-service";
import {
  createCommunityLiveRoomServerSide,
  getCommunityLiveSessionServerSide,
  listCommunityLiveRoomsServerSide,
} from "@/lib/server/community-live-room-service";

export const dynamic = "force-dynamic";

export async function GET(
  _: Request,
  { params }: { params: Promise<{ saId: string; groupId: string }> }
) {
  const { saId, groupId } = await params;
  const access = await requireGroupApiAccess(saId, groupId);
  if (access.kind !== "ok")
    return NextResponse.json(
      { error: access.message },
      { status: access.status }
    );
  const rooms = await listCommunityLiveRoomsServerSide(saId, groupId);
  return NextResponse.json({ rooms });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ saId: string; groupId: string }> }
) {
  const { saId, groupId } = await params;
  const access = await requireGroupApiAccess(saId, groupId);
  if (access.kind !== "ok")
    return NextResponse.json(
      { error: access.message },
      { status: access.status }
    );
  let body: {
    action?: string;
    roomId?: string;
    title?: string;
    description?: string;
    mode?: "meeting" | "broadcast";
    channel?: string | null;
    keepAsPost?: boolean;
    notifyMembers?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (body.action === "create") {
    if (access.membership.role !== "moderator")
      return NextResponse.json(
        { error: "Moderator access required" },
        { status: 403 }
      );
    if (!body.title?.trim())
      return NextResponse.json({ error: "Title is required" }, { status: 400 });
    const channel = body.channel?.trim() || null;
    if (channel) {
      const channelRecord = await getChannelByName(saId, groupId, channel);
      if (!channelRecord) {
        return NextResponse.json(
          { error: "Selected channel was not found" },
          { status: 400 }
        );
      }
    }
    const room = await createCommunityLiveRoomServerSide({
      subAccountId: saId,
      agencyId: access.group.agencyId,
      groupId,
      createdByMemberId: access.member.id,
      title: body.title,
      description: body.description,
      mode: body.mode === "broadcast" ? "broadcast" : "meeting",
      channel,
      keepAsPost: body.keepAsPost !== false,
      notifyMembers: body.notifyMembers === true,
    });
    return NextResponse.json({ room }, { status: 201 });
  }

  if (!body.roomId)
    return NextResponse.json({ error: "Room is required" }, { status: 400 });
  const found = await getCommunityLiveSessionServerSide(
    saId,
    groupId,
    body.roomId
  );
  if (
    !found ||
    found.room.status !== "live" ||
    found.session.status !== "live"
  ) {
    return NextResponse.json(
      { error: "Live room is not active" },
      { status: 404 }
    );
  }
  const isModerator = access.membership.role === "moderator";
  if (!isModerator && found.room.channel) {
    const inaccessible = await getInaccessibleChannelNames({
      subAccountId: saId,
      groupId,
      isModerator: false,
    });
    const channel = await getChannelByName(saId, groupId, found.room.channel);
    if (inaccessible.has(found.room.channel) || channel?.private) {
      return NextResponse.json(
        { error: "You don't have access to this channel" },
        { status: 403 }
      );
    }
  }
  const role = isModerator
    ? "HOST"
    : found.room.mode === "broadcast"
      ? "VIEWER"
      : "ATTENDEE";
  const identity = await resolveLiveParticipantIdentityServerSide({
    uid: access.member.id,
    email: access.member.email,
    displayName: access.member.displayName ?? undefined,
    sessionId: found.session.id,
  });
  const { apiKey, apiSecret } = livekitConfig();
  const permissions = rolePermissions(role);
  const token = new AccessToken(apiKey, apiSecret, {
    identity: identity.stableIdentity,
    name: identity.displayName,
    ttl: "10m",
    metadata: JSON.stringify({
      role,
      source: "community",
      sessionId: found.session.id,
      groupId,
    }),
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

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ saId: string; groupId: string }> }
) {
  const { saId, groupId } = await params;
  const access = await requireGroupApiAccess(saId, groupId);
  if (access.kind !== "ok")
    return NextResponse.json(
      { error: access.message },
      { status: access.status }
    );
  if (access.membership.role !== "moderator")
    return NextResponse.json(
      { error: "Moderator access required" },
      { status: 403 }
    );
  const roomId = new URL(request.url).searchParams.get("roomId");
  if (!roomId)
    return NextResponse.json({ error: "Room is required" }, { status: 400 });
  const { endCommunityLiveRoomServerSide } =
    await import("@/lib/server/community-live-room-service");
  const ended = await endCommunityLiveRoomServerSide(saId, groupId, roomId);
  return ended
    ? NextResponse.json({ ok: true })
    : NextResponse.json({ error: "Room not found" }, { status: 404 });
}
