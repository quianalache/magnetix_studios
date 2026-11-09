import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";
import { checkoutErrorResponse, readBody } from "@/lib/server/checkout/common";
import { addStep, reorderSteps } from "@/lib/server/checkout/funnels-service";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string; funnelId: string }> };

/** Add a step at the end. `{ type, name }` */
export async function POST(request: Request, ctx: Ctx) {
  const { id, funnelId } = await ctx.params;
  const access = await requireSubAccountAdmin(request, id);
  if (access instanceof NextResponse) return access;
  try {
    return NextResponse.json({ step: await addStep({ subAccountId: id, funnelId, body: await readBody(request) }) }, { status: 201 });
  } catch (err) {
    return checkoutErrorResponse(err);
  }
}

/** Reorder. `{ stepIds: string[] }` — must list every step exactly once. */
export async function PUT(request: Request, ctx: Ctx) {
  const { id, funnelId } = await ctx.params;
  const access = await requireSubAccountAdmin(request, id);
  if (access instanceof NextResponse) return access;
  try {
    const body = await readBody(request);
    return NextResponse.json({ steps: await reorderSteps(id, funnelId, body.stepIds) });
  } catch (err) {
    return checkoutErrorResponse(err);
  }
}
