import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountAdmin, requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { checkoutErrorResponse, readBody } from "@/lib/server/checkout/common";
import { createFunnel, listFunnels } from "@/lib/server/checkout/funnels-service";

export const dynamic = "force-dynamic";

/** Funnels in this workspace (members). */
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const access = await requireSubAccountMember(request, id);
  if (access instanceof NextResponse) return access;
  try {
    return NextResponse.json({ funnels: await listFunnels(id) });
  } catch (err) {
    return checkoutErrorResponse(err);
  }
}

/** Create a funnel (admins). `{ name, withCheckoutStep? }` */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const access = await requireSubAccountAdmin(request, id);
  if (access instanceof NextResponse) return access;
  try {
    return NextResponse.json(await createFunnel({ subAccountId: id, uid: access.uid, body: await readBody(request) }), { status: 201 });
  } catch (err) {
    return checkoutErrorResponse(err);
  }
}
