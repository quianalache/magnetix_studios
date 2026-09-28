import "server-only";

import { NextResponse } from "next/server";
import { verifyQStashSignature } from "@/lib/automations/qstash";
import { runRolloverSweep } from "@/lib/server/task-rollover-service";
import { runRoutineGeneration } from "@/lib/server/routines-service";

/**
 * Hourly task maintenance (Projects & Tasks). QStash-scheduled via
 * lib/qstash/register-schedules.ts; in middleware PUBLIC_PATHS because
 * security is the signature, not a session. Two independent sweeps:
 * - optional rollover — only tasks that opted in (`autoRollover: true`)
 *   are ever moved;
 * - Routines — generates today's activity tasks for active routines whose
 *   run date it is (idempotent: deterministic ids + create()).
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
    const rollover = await runRolloverSweep();
    let routines: { checked: number; created: number } | { error: string };
    try {
      routines = await runRoutineGeneration();
    } catch (err) {
      console.error("[cron/task-rollover] routine generation failed", err);
      routines = { error: "routine_generation_failed" };
    }
    return NextResponse.json({ ok: true, ...rollover, routines });
  } catch (err) {
    console.error("[cron/task-rollover] sweep failed", err);
    return NextResponse.json({ error: "sweep_failed" }, { status: 500 });
  }
}
