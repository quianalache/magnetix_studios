import "server-only";

import { NextResponse } from "next/server";
import { checkoutErrorResponse, readBody } from "@/lib/server/checkout/common";
import { validateBuyerStep } from "@/lib/server/checkout/order-service";

export const dynamic = "force-dynamic";

/** Public: step 1 of a two-step checkout. Validates only; writes nothing. */
export async function POST(request: Request, ctx: { params: Promise<{ configId: string }> }) {
  const { configId } = await ctx.params;
  try {
    await validateBuyerStep(configId, await readBody(request));
    return NextResponse.json({ ok: true });
  } catch (err) {
    return checkoutErrorResponse(err);
  }
}
