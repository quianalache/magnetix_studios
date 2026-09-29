import { NextResponse } from "next/server";
import { RoomServiceClient, TrackSource } from "livekit-server-sdk";
import { requireGroupApiAccess } from "@/lib/community/member-context";
import { getCommunityLiveSessionServerSide } from "@/lib/server/community-live-room-service";
import { livekitConfig } from "@/lib/livekit/config";
import { rolePermissions } from "@/lib/server/live-session-service";

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
  if (access.membership.role !== "moderator")
    return NextResponse.json(
      { error: "Moderator access required" },
      { status: 403 }
    );
  const body = (await request.json()) as {
    roomId?: string;
    identity?: string;
    role?: "SPEAKER" | "ATTENDEE" | "PRESENTER";
  };
  if (!body.roomId || !body.identity || !body.role)
    return NextResponse.json(
      { error: "Room, identity, and role are required" },
      { status: 400 }
    );
  const found = await getCommunityLiveSessionServerSide(
    saId,
    groupId,
    body.roomId
  );
  if (!found || found.room.status !== "live")
    return NextResponse.json(
      { error: "Live room is not active" },
      { status: 404 }
    );
  const { url, apiKey, apiSecret } = livekitConfig();
  const client = new RoomServiceClient(url, apiKey, apiSecret);
  const permissions = rolePermissions(body.role);
  await client.updateParticipant(
    found.session.providerRoomName,
    body.identity,
    {
      permission: {
        ...permissions,
        canPublishSources: permissions.canPublish
          ? [
              TrackSource.CAMERA,
              TrackSource.MICROPHONE,
              TrackSource.SCREEN_SHARE,
            ]
          : [],
      },
    }
  );
  return NextResponse.json({ ok: true, role: body.role });
}
