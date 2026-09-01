import { NextResponse } from "next/server";
import { WebhookReceiver } from "livekit-server-sdk";
import { livekitConfig } from "@/lib/livekit/config";
import { reconcileCommunityRecordingEgressServerSide } from "@/lib/server/community-live-recording-service";

export const dynamic = "force-dynamic";

/** LiveKit signs this request with the existing server API credentials. No
 * client-facing identifiers are sufficient to move a recording to ready. */
export async function POST(request: Request) {
  try {
    const { apiKey, apiSecret } = livekitConfig();
    const event = await new WebhookReceiver(apiKey, apiSecret).receive(
      await request.text(),
      request.headers.get("Authorization") ?? undefined
    );
    if (
      (event.event === "egress_ended" || event.event === "egress_updated") &&
      event.egressInfo
    ) {
      await reconcileCommunityRecordingEgressServerSide(event.egressInfo);
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { error: "Invalid LiveKit webhook" },
      { status: 401 }
    );
  }
}
