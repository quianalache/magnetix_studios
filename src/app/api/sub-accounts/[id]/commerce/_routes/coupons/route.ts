import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountAdmin, requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { checkoutErrorResponse, readBody } from "@/lib/server/checkout/common";
import { createCoupon, listCoupons } from "@/lib/server/checkout/coupons-service";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const access = await requireSubAccountMember(request, id);
  if (access instanceof NextResponse) return access;
  try {
    return NextResponse.json(await listCoupons(id));
  } catch (err) {
    return checkoutErrorResponse(err);
  }
}

export async function POST(request: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const access = await requireSubAccountAdmin(request, id);
  if (access instanceof NextResponse) return access;
  try {
    return NextResponse.json({ coupon: await createCoupon({ subAccountId: id, uid: access.uid, body: await readBody(request) }) }, { status: 201 });
  } catch (err) {
    return checkoutErrorResponse(err);
  }
}
