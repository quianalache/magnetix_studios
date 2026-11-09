import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { checkoutErrorResponse } from "@/lib/server/checkout/common";
import { getCheckoutConfigDoc } from "@/lib/server/checkout/config-service";
import { buildCheckoutView } from "@/lib/server/checkout/view-service";
import { CheckoutError } from "@/lib/server/checkout/common";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string; configId: string }> };

/** Saved settings rendered as the buyer would see them (drafts included). Never takes payment. */
export async function GET(request: Request, ctx: Ctx) {
  const { id, configId } = await ctx.params;
  const access = await requireSubAccountMember(request, id);
  if (access instanceof NextResponse) return access;
  try {
    const config = await getCheckoutConfigDoc(configId);
    if (!config || config.subAccountId !== id) throw new CheckoutError("Checkout not found.", 404);
    return NextResponse.json({ view: await buildCheckoutView(configId, { preview: true }) });
  } catch (err) {
    return checkoutErrorResponse(err);
  }
}
