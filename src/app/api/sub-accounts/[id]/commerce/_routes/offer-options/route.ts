import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { checkoutErrorResponse } from "@/lib/server/checkout/common";
import { listOfferOptions } from "@/lib/server/checkout/config-service";

export const dynamic = "force-dynamic";

/** Non-archived Offers with authoritative price labels, for pickers. */
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const access = await requireSubAccountMember(request, id);
  if (access instanceof NextResponse) return access;
  try {
    return NextResponse.json({ offers: await listOfferOptions(id) });
  } catch (err) {
    return checkoutErrorResponse(err);
  }
}
