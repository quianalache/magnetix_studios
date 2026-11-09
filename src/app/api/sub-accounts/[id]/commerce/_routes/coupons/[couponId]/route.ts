import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";
import { checkoutErrorResponse, readBody } from "@/lib/server/checkout/common";
import { removeCoupon, updateCoupon } from "@/lib/server/checkout/coupons-service";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string; couponId: string }> };

export async function PATCH(request: Request, ctx: Ctx) {
  const { id, couponId } = await ctx.params;
  const access = await requireSubAccountAdmin(request, id);
  if (access instanceof NextResponse) return access;
  try {
    return NextResponse.json({ coupon: await updateCoupon({ subAccountId: id, couponId, body: await readBody(request) }) });
  } catch (err) {
    return checkoutErrorResponse(err);
  }
}

/** Deletes an unused coupon; archives one that has redemptions. */
export async function DELETE(request: Request, ctx: Ctx) {
  const { id, couponId } = await ctx.params;
  const access = await requireSubAccountAdmin(request, id);
  if (access instanceof NextResponse) return access;
  try {
    return NextResponse.json(await removeCoupon(id, couponId));
  } catch (err) {
    return checkoutErrorResponse(err);
  }
}
