import "server-only";

import { NextResponse } from "next/server";
import { checkoutErrorResponse, readBody } from "@/lib/server/checkout/common";
import { quoteCheckout } from "@/lib/server/checkout/order-service";

export const dynamic = "force-dynamic";

/** Public: server-computed totals for the chosen bumps + discount code. */
export async function POST(request: Request, ctx: { params: Promise<{ configId: string }> }) {
  const { configId } = await ctx.params;
  try {
    return NextResponse.json(await quoteCheckout(configId, await readBody(request)));
  } catch (err) {
    return checkoutErrorResponse(err);
  }
}
