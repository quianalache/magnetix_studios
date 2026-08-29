import { NextResponse } from "next/server";
import { RoomServiceClient, TrackSource } from "livekit-server-sdk";
import { requireGroupApiAccess } from "@/lib/community/member-context";
import { getCommunityEventSessionServerSide } from "@/lib/server/community-event-service";
import { livekitConfig } from "@/lib/livekit/config";
import { rolePermissions } from "@/lib/server/live-session-service";

export async function POST(
  request: Request,
  {
    params,
  }: { params: Promise<{ saId: string; groupId: string; eventId: string }> }
) {
  const { saId, groupId, eventId } = await params;
  const access = await requireGroupApiAccess(saId, groupId);
  if (access.kind !== "ok" || access.membership.role !== "moderator")
    return NextResponse.json(
      { error: "Moderator access required" },
      { status: access.kind === "ok" ? 403 : access.status }
    );
  const body = (await request.json()) as {
    identity?: string;
    role?: "SPEAKER" | "ATTENDEE" | "PRESENTER";
  };
  const found = await getCommunityEventSessionServerSide(
    saId,
    groupId,
    eventId
  );
  if (!found || found.event.status !== "live" || !body.identity || !body.role)
    return NextResponse.json(
      { error: "Live event or participant not found" },
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
