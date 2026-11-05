import { NextResponse } from "next/server";
import { verifyQStashSignature } from "@/lib/automations/qstash";
import { runCommunityDigests } from "@/lib/server/community-digest-service";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Daily QStash schedule — sends each community digest that is due (off by default). */
export async function POST(request: Request) {
  const signature = request.headers.get("upstash-signature");
  const rawBody = await request.text();
  if (!signature || !(await verifyQStashSignature(signature, rawBody)))
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  try {
    const result = await runCommunityDigests();
    console.info("[community-digest] run", result);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("[community-digest] run failed", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Digest run failed" }, { status: 500 });
  }
}
