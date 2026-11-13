import "server-only";

import { NextResponse } from "next/server";
import { checkoutErrorResponse } from "@/lib/server/checkout/common";
import { orderStatusForBuyer } from "@/lib/server/checkout/order-service";
import { openFunnelSessionForOrder } from "@/lib/server/checkout/funnel-runtime-service";

export const dynamic = "force-dynamic";

/**
 * Public: order status after payment. Verifies with Stripe and fulfils if needed.
 * Funnel Checkouts: once the order is PAID (and only then), this is where the
 * buyer's post-purchase funnel session starts — a signed httpOnly cookie for
 * this funnel (only when post-purchase charging is enabled; see
 * lib/checkout/capabilities.ts).
 */
export async function GET(_request: Request, ctx: { params: Promise<{ configId: string; orderId: string }> }) {
  const { configId, orderId } = await ctx.params;
  try {
    const status = await orderStatusForBuyer(orderId, configId);
    if (!status) return NextResponse.json({ error: "Order not found." }, { status: 404 });
    const res = NextResponse.json(status);
    if (status.status === "paid") {
      const session = await openFunnelSessionForOrder(orderId).catch((err) => {
        console.error("[checkout] funnel session start failed", orderId, err);
        return null;
      });
      if (session) {
        res.cookies.set(session.cookieName, session.token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "lax",
          path: "/",
          maxAge: session.maxAgeSeconds,
        });
      }
    }
    return res;
  } catch (err) {
    return checkoutErrorResponse(err);
  }
}
