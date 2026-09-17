import { NextResponse } from "next/server";
import { RoomServiceClient, TrackSource } from "livekit-server-sdk";
import { resolveAgencyCommunityCaller } from "@/lib/server/agency-community-access";
import { getAgencyEventSessionServerSide } from "@/lib/server/agency-community-event-service";
import { livekitConfig } from "@/lib/livekit/config";
import { rolePermissions } from "@/lib/server/live-session-service";

/** Moderate an active participant's publish permissions. Owner-only. */
export async function POST(
  request: Request,
  ctx: { params: Promise<{ groupId: string; eventId: string }> },
) {
  const { groupId, eventId } = await ctx.params;
  const caller = await resolveAgencyCommunityCaller(request, groupId);
  if (caller instanceof NextResponse) return caller;
  if (caller.kind !== "owner") {
    return NextResponse.json({ error: "Owner access required" }, { status: 403 });
  }

  const body = (await request.json()) as { identity?: string; role?: "SPEAKER" | "ATTENDEE" | "PRESENTER" };
  const found = await getAgencyEventSessionServerSide(caller.agencyId, groupId, eventId);
  if (!found || found.event.status !== "live" || !body.identity || !body.role) {
    return NextResponse.json({ error: "Live event or participant not found" }, { status: 404 });
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
