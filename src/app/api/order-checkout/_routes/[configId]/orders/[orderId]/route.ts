import "server-only";

import { NextResponse } from "next/server";
import { checkoutErrorResponse } from "@/lib/server/checkout/common";
import { orderStatusForBuyer } from "@/lib/server/checkout/order-service";

export const dynamic = "force-dynamic";

/** Public: order status after payment. Verifies with Stripe and fulfils if needed. */
export async function GET(_request: Request, ctx: { params: Promise<{ configId: string; orderId: string }> }) {
  const { configId, orderId } = await ctx.params;
  try {
    const status = await orderStatusForBuyer(orderId, configId);
    if (!status) return NextResponse.json({ error: "Order not found." }, { status: 404 });
    return NextResponse.json(status);
  } catch (err) {
    return checkoutErrorResponse(err);
  }
}
