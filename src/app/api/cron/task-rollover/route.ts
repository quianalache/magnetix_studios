import "server-only";

import { NextResponse } from "next/server";
import { verifyQStashSignature } from "@/lib/automations/qstash";
import { runRolloverSweep } from "@/lib/server/task-rollover-service";

/**
 * Hourly optional task rollover (Projects & Tasks Phase 2). QStash-
 * scheduled via lib/qstash/register-schedules.ts; in middleware
 * PUBLIC_PATHS because security is the signature, not a session. Only
 * tasks that opted in (`autoRollover: true`) are ever moved.
 */
export async function POST(request: Request) {
  const signature = request.headers.get("upstash-signature");
  const rawBody = await request.text();
  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 401 });
  }
  if (!(await verifyQStashSignature(signature, rawBody))) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }
  try {
    return NextResponse.json({ ok: true, ...(await runRolloverSweep()) });
  } catch (err) {
    console.error("[cron/task-rollover] sweep failed", err);
    return NextResponse.json({ error: "sweep_failed" }, { status: 500 });
  }
}
