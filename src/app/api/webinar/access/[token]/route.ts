import { NextResponse } from "next/server";
import { AccessToken } from "livekit-server-sdk";
import {
  getLiveSessionServerSide,
  rolePermissions,
} from "@/lib/server/live-session-service";
import {
  getWebinarRegistrantServerSide,
  getWebinarServerSide,
  markWebinarJoinedServerSide,
} from "@/lib/server/webinar-service";
import { verifyWebinarRegistrantToken } from "@/lib/server/webinar-token";
import { livekitConfig } from "@/lib/livekit/config";

export async function POST(
  _: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const verified = verifyWebinarRegistrantToken((await params).token);
  if (!verified)
    return NextResponse.json(
      { error: "Invalid access token" },
      { status: 401 }
    );
  const resolved = await getWebinarServerSide(
    verified.subAccountId,
    verified.webinarId
  );
  if (!resolved)
    return NextResponse.json({ error: "Webinar not found" }, { status: 404 });
  const registrant = await getWebinarRegistrantServerSide(
    resolved.subAccountId,
    resolved.id,
    verified.registrantId
  );
  const session = resolved.liveSessionId
    ? await getLiveSessionServerSide(resolved.liveSessionId)
    : null;
  if (
    !registrant ||
    registrant.status !== "registered" ||
    !session ||
    session.status !== "live"
  )
    return NextResponse.json(
      { error: "Webinar is not live or registration is invalid" },
      { status: 403 }
    );
  await markWebinarJoinedServerSide(
    resolved.subAccountId,
    resolved.id,
    registrant.id
  );
  const { apiKey, apiSecret } = livekitConfig();
  const permissions = rolePermissions("VIEWER");
  const token = new AccessToken(apiKey, apiSecret, {
    identity: `webinar-${registrant.id}`,
    name: `${registrant.firstName} ${registrant.lastName}`.trim(),
    ttl: "10m",
    metadata: JSON.stringify({
      role: "VIEWER",
      source: "webinar",
      webinarId: resolved.id,
      registrantId: registrant.id,
    }),
  });
  token.addGrant({
    roomJoin: true,
    room: session.providerRoomName,
    ...permissions,
    canPublishSources: [],
  });
  return NextResponse.json({
    token: await token.toJwt(),
    url: process.env.LIVEKIT_URL,
    title: resolved.title,
    role: "VIEWER",
  });
}
