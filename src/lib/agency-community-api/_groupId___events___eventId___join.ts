import { NextResponse } from "next/server";
import { AccessToken, TrackSource } from "livekit-server-sdk";
import { livekitConfig } from "@/lib/livekit/config";
import { resolveAgencyCommunityCaller, agencyMemberDisplayName } from "@/lib/server/agency-community-access";
import { resolveLiveParticipantIdentityServerSide } from "@/lib/server/live-session-identity-service";
import { getAgencyEventSessionServerSide } from "@/lib/server/agency-community-event-service";
import { rolePermissions } from "@/lib/server/live-session-service";
import { getAgencyChannelByName, getAgencyInaccessibleChannelNames } from "@/lib/server/community-agency-service";

/** Mint a LiveKit join token for a live Agency Community event. Owner OR
 *  an active member of THIS community. */
export async function POST(
  request: Request,
  ctx: { params: Promise<{ groupId: string; eventId: string }> },
) {
  const { groupId, eventId } = await ctx.params;
  const caller = await resolveAgencyCommunityCaller(request, groupId);
  if (caller instanceof NextResponse) return caller;
  const isModerator = caller.kind === "owner";

  const found = await getAgencyEventSessionServerSide(caller.agencyId, groupId, eventId);
  if (!found || found.event.status !== "live" || found.session.status !== "live") {
    return NextResponse.json({ error: "Event is not live" }, { status: 404 });
  }
  if (!isModerator && found.event.channel) {
    const channel = await getAgencyChannelByName(caller.agencyId, groupId, found.event.channel);
    const inaccessible = await getAgencyInaccessibleChannelNames({
      agencyId: caller.agencyId,
      groupId,
      isModerator: false,
    });
    if (!channel || channel.private || inaccessible.has(found.event.channel)) {
      return NextResponse.json({ error: "You don't have access to this channel" }, { status: 403 });
    }
  }

  const role = isModerator ? "HOST" : found.event.liveMode === "broadcast" ? "VIEWER" : "ATTENDEE";
  const identityId = caller.kind === "owner" ? caller.uid : caller.personId;
  const displayName =
    caller.kind === "owner" ? "Host" : agencyMemberDisplayName(caller.membership);
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
    metadata: JSON.stringify({ role, source: "agency_community_event", sessionId: found.session.id, groupId }),
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
