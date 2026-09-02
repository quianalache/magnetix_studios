import { NextResponse } from "next/server";
import { verifyQStashSignature } from "@/lib/automations/qstash";
import { reconcileStaleCommunityRecordingsServerSide } from "@/lib/server/community-recording-reconciliation-service";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const signature = request.headers.get("upstash-signature");
  const rawBody = await request.text();
  if (!signature || !(await verifyQStashSignature(signature, rawBody)))
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  try {
    const results = await reconcileStaleCommunityRecordingsServerSide();
    console.info("[community-recording-reconciliation] scheduled sweep", {
      inspected: results.length,
      finalized: results.filter((x) => x.wouldFinalize).length,
      failed: results.filter((x) => x.wouldFail).length,
    });
    return NextResponse.json({ ok: true, inspected: results.length });
  } catch (error) {
    console.error(
      "[community-recording-reconciliation] scheduled sweep failed",
      {
        message: error instanceof Error ? error.message : "unknown",
      }
    );
    return NextResponse.json(
      { error: "Reconciliation failed" },
      { status: 500 }
    );
  }
}
