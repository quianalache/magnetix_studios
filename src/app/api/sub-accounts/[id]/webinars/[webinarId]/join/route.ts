import { NextResponse } from "next/server";
import { AccessToken, TrackSource } from "livekit-server-sdk";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";
import { livekitConfig } from "@/lib/livekit/config";
import { getWebinarSessionServerSide } from "@/lib/server/webinar-service";
import { resolveLiveParticipantIdentityServerSide } from "@/lib/server/live-session-identity-service";
import { rolePermissions } from "@/lib/server/live-session-service";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; webinarId: string }> }
) {
  const { id, webinarId } = await params;
  const access = await requireSubAccountAdmin(request, id);
  if (access instanceof NextResponse) return access;
  const found = await getWebinarSessionServerSide(id, webinarId);
  if (
    !found ||
    found.webinar.status !== "live" ||
    found.session.status !== "live"
  ) {
    return NextResponse.json({ error: "Webinar is not live" }, { status: 409 });
  }
  const identity = await resolveLiveParticipantIdentityServerSide({
    uid: access.uid,
    email: access.email,
    sessionId: found.session.id,
  });
  const { apiKey, apiSecret } = livekitConfig();
  const permissions = rolePermissions("HOST");
  const token = new AccessToken(apiKey, apiSecret, {
    identity: identity.stableIdentity,
    name: identity.displayName,
    ttl: "10m",
    metadata: JSON.stringify({ role: "HOST", source: "webinar", webinarId }),
  });
  token.addGrant({
    roomJoin: true,
    room: found.session.providerRoomName,
    ...permissions,
    canPublishSources: [
      TrackSource.CAMERA,
      TrackSource.MICROPHONE,
      TrackSource.SCREEN_SHARE,
    ],
  });
  return NextResponse.json({
    token: await token.toJwt(),
    url: process.env.LIVEKIT_URL,
    title: found.webinar.title,
    role: "HOST",
  });
}
