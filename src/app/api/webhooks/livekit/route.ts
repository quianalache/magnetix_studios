import { NextResponse } from "next/server";
import { WebhookReceiver } from "livekit-server-sdk";
import { livekitConfig } from "@/lib/livekit/config";
import { reconcileCommunityRecordingEgressServerSide } from "@/lib/server/community-live-recording-service";

export const dynamic = "force-dynamic";

/** LiveKit signs this request with the existing server API credentials. No
 * client-facing identifiers are sufficient to move a recording to ready. */
export async function POST(request: Request) {
  let eventType = "unknown";
  let providerEgressId: string | null = null;
  try {
    const { apiKey, apiSecret } = livekitConfig();
    const event = await new WebhookReceiver(apiKey, apiSecret).receive(
      await request.text(),
      request.headers.get("Authorization") ?? undefined
    );
    eventType = event.event;
    providerEgressId = event.egressInfo?.egressId ?? null;
    console.info("[livekit-webhook] verified", {
      eventType,
      providerEgressId,
      status: event.egressInfo?.status ?? null,
    });
    if (
      (event.event === "egress_ended" || event.event === "egress_updated") &&
      event.egressInfo
    ) {
      await reconcileCommunityRecordingEgressServerSide(event.egressInfo);
      console.info("[livekit-webhook] finalization complete", {
        eventType,
        providerEgressId,
      });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[livekit-webhook] rejected or failed", {
      eventType,
      providerEgressId,
      message: error instanceof Error ? error.message : "unknown",
    });
    return NextResponse.json(
      { error: "Invalid LiveKit webhook" },
      { status: 401 }
    );
  }
}
