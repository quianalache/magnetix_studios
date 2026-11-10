import "server-only";

import { NextResponse } from "next/server";
import { checkoutErrorResponse, checkoutStartRateLimited, readBody } from "@/lib/server/checkout/common";
import { startOneStepSession } from "@/lib/server/checkout/order-service";

export const dynamic = "force-dynamic";

/**
 * Public: one-step checkout start. The page calls this once a VALID email
 * has been entered (when the buyer leaves the field, debounced) — never per
 * keystroke. Creates/reuses the checkout session + Contact per the
 * checkout's CRM settings; returns `sessionId: null` when capture is off.
 */
export async function POST(request: Request, ctx: { params: Promise<{ configId: string }> }) {
  const { configId } = await ctx.params;
  const limited = checkoutStartRateLimited(request);
  if (limited) return limited;
  try {
    return NextResponse.json(await startOneStepSession(configId, await readBody(request)));
  } catch (err) {
    return checkoutErrorResponse(err);
  }
}
