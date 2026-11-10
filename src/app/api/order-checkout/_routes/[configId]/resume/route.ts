import "server-only";

import { NextResponse } from "next/server";
import { assertId, checkoutErrorResponse, checkoutStartRateLimited, readBody } from "@/lib/server/checkout/common";
import { resumeCheckoutSession } from "@/lib/server/checkout/crm-service";

export const dynamic = "force-dynamic";

/**
 * Public: exchange a signed abandoned-checkout resume link for the buyer's
 * details + last selection, to PREFILL the checkout. Carries no prices —
 * the page re-quotes everything and payment re-validates again.
 */
export async function POST(request: Request, ctx: { params: Promise<{ configId: string }> }) {
  const { configId } = await ctx.params;
  const limited = checkoutStartRateLimited(request, "resume");
  if (limited) return limited;
  try {
    assertId(configId, "checkout");
    const body = await readBody(request);
    const result = await resumeCheckoutSession(configId, body.token);
    return NextResponse.json(result, { status: result.status === "invalid" ? 404 : 200 });
  } catch (err) {
    return checkoutErrorResponse(err);
  }
}
