import { NextResponse } from "next/server";
import { RoomServiceClient, TrackSource } from "livekit-server-sdk";
import { resolveAgencyCommunityCaller } from "@/lib/server/agency-community-access";
import { getAgencyLiveSessionServerSide } from "@/lib/server/agency-community-live-room-service";
import { livekitConfig } from "@/lib/livekit/config";
import { rolePermissions } from "@/lib/server/live-session-service";

export async function POST(request: Request, ctx: { params: Promise<{ groupId: string }> }) {
  const { groupId } = await ctx.params;
  const caller = await resolveAgencyCommunityCaller(request, groupId);
  if (caller instanceof NextResponse) return caller;
  if (caller.kind !== "owner") {
    return NextResponse.json({ error: "Owner access required" }, { status: 403 });
  }
  const body = (await request.json()) as {
    roomId?: string;
    identity?: string;
    role?: "SPEAKER" | "ATTENDEE" | "PRESENTER";
  };
  if (!body.roomId || !body.identity || !body.role) {
    return NextResponse.json({ error: "Room, identity, and role are required" }, { status: 400 });
  }
  const found = await getAgencyLiveSessionServerSide(caller.agencyId, groupId, body.roomId);
  if (!found || found.room.status !== "live") {
    return NextResponse.json({ error: "Live room is not active" }, { status: 404 });
  }
  const { url, apiKey, apiSecret } = livekitConfig();
  const client = new RoomServiceClient(url, apiKey, apiSecret);
  const permissions = rolePermissions(body.role);
  await client.updateParticipant(found.session.providerRoomName, body.identity, {
    permission: {
      ...permissions,
      canPublishSources: permissions.canPublish
        ? [TrackSource.CAMERA, TrackSource.MICROPHONE, TrackSource.SCREEN_SHARE]
        : [],
    },
  });
  return NextResponse.json({ ok: true, role: body.role });
}
