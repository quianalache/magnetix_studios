import "server-only";

import { NextResponse } from "next/server";
import { verifyQStashSignature } from "@/lib/automations/qstash";
import { runRolloverSweep } from "@/lib/server/task-rollover-service";
import { runRoutineGeneration } from "@/lib/server/routines-service";
import { sweepAbandonedCheckouts } from "@/lib/server/checkout/crm-service";
import { retryPendingPaymentWorkflowEvents } from "@/lib/server/payment-workflow-events";
import { retryPendingFunnelEffects } from "@/lib/server/checkout/funnel-runtime-service";

/**
 * Hourly task maintenance (Projects & Tasks). QStash-scheduled via
 * lib/qstash/register-schedules.ts; in middleware PUBLIC_PATHS because
 * security is the signature, not a session. Two independent sweeps:
 * - optional rollover — only tasks that opted in (`autoRollover: true`)
 *   are ever moved;
 * - Routines — generates today's activity tasks for active routines whose
 *   run date it is (idempotent: deterministic ids + create()).
 * - Checkout abandonment backstop (Phase 3) — sessions whose abandonment
 *   timer is due but never arrived (idempotent per session).
 * - Payment workflow events (CRM Batch C) — verified Stripe events still
 *   waiting for their Contact link, or whose workflow delivery failed, are
 *   retried with backoff (bounded; idempotent per logical event).
 * - Funnel Upsell / Downsell outcome actions that didn't finish are retried
 *   (once-only keys).
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
    // Checkout Phase 3 backstop: abandoned-checkout timers QStash missed.
    let checkouts: { checked: number; fired: number } | { error: string };
    try {
      checkouts = await sweepAbandonedCheckouts();
    } catch (err) {
      console.error("[cron/task-rollover] checkout abandonment sweep failed", err);
      checkouts = { error: "checkout_sweep_failed" };
    }
    let paymentEvents: Awaited<ReturnType<typeof retryPendingPaymentWorkflowEvents>> | { error: string };
    try {
      paymentEvents = await retryPendingPaymentWorkflowEvents();
    } catch (err) {
      console.error("[cron/task-rollover] payment workflow event retry failed", err);
      paymentEvents = { error: "payment_event_retry_failed" };
    }
    let funnelEffects: { checked: number } | { error: string };
    try {
      funnelEffects = await retryPendingFunnelEffects();
    } catch (err) {
      console.error("[cron/task-rollover] funnel outcome effect retry failed", err);
      funnelEffects = { error: "funnel_effects_retry_failed" };
    }
    return NextResponse.json({ ok: true, ...rollover, routines, checkouts, paymentEvents, funnelEffects });
  } catch (err) {
    console.error("[cron/task-rollover] sweep failed", err);
    return NextResponse.json({ error: "sweep_failed" }, { status: 500 });
  }
}
