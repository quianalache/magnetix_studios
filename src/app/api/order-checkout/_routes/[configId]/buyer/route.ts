import "server-only";

import { NextResponse } from "next/server";
import { checkoutErrorResponse, checkoutStartRateLimited, readBody } from "@/lib/server/checkout/common";
import { startBuyerStep } from "@/lib/server/checkout/order-service";

export const dynamic = "force-dynamic";

/**
 * Public: step 1 of a two-step checkout. Validates the buyer's details and —
 * this is the deliberate checkout start — records the checkout session and
 * Contact when the checkout's CRM settings capture contacts.
 */
export async function POST(request: Request, ctx: { params: Promise<{ configId: string }> }) {
  const { configId } = await ctx.params;
  const limited = checkoutStartRateLimited(request);
  if (limited) return limited;
  try {
    const { sessionId } = await startBuyerStep(configId, await readBody(request));
    return NextResponse.json({ ok: true, sessionId });
  } catch (err) {
    return checkoutErrorResponse(err);
  }
}
