import "server-only";

import { NextResponse } from "next/server";
import { verifyQStashSignature } from "@/lib/automations/qstash";
import { runAbandonmentStep } from "@/lib/server/checkout/crm-service";

export const dynamic = "force-dynamic";

/**
 * QStash timer callback: is this checkout session abandoned yet? Security
 * is the Upstash signature (the /api/order-checkout prefix is public).
 * Always 200 after verification so QStash never retry-storms; the step
 * itself is idempotent.
 */
export async function POST(request: Request) {
  const signature = request.headers.get("upstash-signature");
  const raw = await request.text();
  if (!signature || !(await verifyQStashSignature(signature, raw))) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }
  let sessionId = "";
  try {
    sessionId = String((JSON.parse(raw) as { sessionId?: unknown }).sessionId ?? "");
  } catch {
    return NextResponse.json({ ok: false });
  }
  try {
    return NextResponse.json({ ok: true, outcome: await runAbandonmentStep(sessionId) });
  } catch (err) {
    console.error("[checkout/abandonment] step failed", sessionId, err);
    return NextResponse.json({ ok: false });
  }
}
