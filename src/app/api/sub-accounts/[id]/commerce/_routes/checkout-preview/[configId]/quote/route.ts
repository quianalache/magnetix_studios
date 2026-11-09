import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { checkoutErrorResponse, readBody } from "@/lib/server/checkout/common";
import { getCheckoutConfigDoc } from "@/lib/server/checkout/config-service";
import { quoteCheckout } from "@/lib/server/checkout/order-service";
import { CheckoutError } from "@/lib/server/checkout/common";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string; configId: string }> };

/** Totals for the admin preview (same pricing as the live checkout). */
export async function POST(request: Request, ctx: Ctx) {
  const { id, configId } = await ctx.params;
  const access = await requireSubAccountMember(request, id);
  if (access instanceof NextResponse) return access;
  try {
    const config = await getCheckoutConfigDoc(configId);
    if (!config || config.subAccountId !== id) throw new CheckoutError("Checkout not found.", 404);
    return NextResponse.json(await quoteCheckout(configId, await readBody(request), { preview: true }));
  } catch (err) {
    return checkoutErrorResponse(err);
  }
}
