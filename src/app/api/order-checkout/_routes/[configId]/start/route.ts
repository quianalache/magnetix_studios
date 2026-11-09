import "server-only";

import { NextResponse } from "next/server";
import { checkoutErrorResponse, readBody } from "@/lib/server/checkout/common";
import { signupRateLimitError } from "@/lib/community/signup-sign-in-link";
import { startCheckout } from "@/lib/server/checkout/order-service";

export const dynamic = "force-dynamic";

/**
 * Public: create the order (identity, per-Offer purchases, Stripe intent).
 * Returns the client secret the Payment Element confirms, or a redirect
 * when nothing is owed. Rate-limited per IP like the classic signup.
 */
export async function POST(request: Request, ctx: { params: Promise<{ configId: string }> }) {
  const { configId } = await ctx.params;
  const limited = signupRateLimitError(request);
  if (limited) return NextResponse.json({ error: limited }, { status: 429 });
  try {
    return NextResponse.json(await startCheckout(configId, await readBody(request)));
  } catch (err) {
    return checkoutErrorResponse(err);
  }
}
