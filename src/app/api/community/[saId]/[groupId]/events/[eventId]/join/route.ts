import { NextResponse } from "next/server";
import { AccessToken, TrackSource } from "livekit-server-sdk";
import { livekitConfig } from "@/lib/livekit/config";
import { requireGroupApiAccess } from "@/lib/community/member-context";
import { resolveLiveParticipantIdentityServerSide } from "@/lib/server/live-session-identity-service";
import { getCommunityEventSessionServerSide } from "@/lib/server/community-event-service";
import { rolePermissions } from "@/lib/server/live-session-service";
import {
  getChannelByName,
  getInaccessibleChannelNames,
} from "@/lib/server/community-channels-service";

export async function POST(
  _: Request,
  {
    params,
  }: { params: Promise<{ saId: string; groupId: string; eventId: string }> }
) {
  const { saId, groupId, eventId } = await params;
  const access = await requireGroupApiAccess(saId, groupId);
  if (access.kind !== "ok")
    return NextResponse.json(
      { error: access.message },
      { status: access.status }
    );
  const found = await getCommunityEventSessionServerSide(
    saId,
    groupId,
    eventId
  );
  if (
    !found ||
    found.event.status !== "live" ||
    found.session.status !== "live"
  )
    return NextResponse.json({ error: "Event is not live" }, { status: 404 });
  if (access.membership.role !== "moderator" && found.event.channel) {
    const channel = await getChannelByName(saId, groupId, found.event.channel);
    const inaccessible = await getInaccessibleChannelNames({
      subAccountId: saId,
      groupId,
      isModerator: false,
    });
    if (!channel || channel.private || inaccessible.has(found.event.channel))
      return NextResponse.json(
        { error: "You don't have access to this channel" },
        { status: 403 }
      );
  }
  const role =
    access.membership.role === "moderator"
      ? "HOST"
      : found.event.liveMode === "broadcast"
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
      source: "community_event",
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
    role,
    title: found.event.title,
    communityPostId: null,
  });
}
