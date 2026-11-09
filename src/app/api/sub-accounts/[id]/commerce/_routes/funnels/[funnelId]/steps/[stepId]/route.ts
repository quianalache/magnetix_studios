import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";
import { checkoutErrorResponse, readBody } from "@/lib/server/checkout/common";
import { deleteStep, updateStep } from "@/lib/server/checkout/funnels-service";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string; funnelId: string; stepId: string }> };

/** Rename a step or set its page. `{ name?, pageId? }` */
export async function PATCH(request: Request, ctx: Ctx) {
  const { id, funnelId, stepId } = await ctx.params;
  const access = await requireSubAccountAdmin(request, id);
  if (access instanceof NextResponse) return access;
  try {
    return NextResponse.json({ step: await updateStep(id, funnelId, stepId, await readBody(request)) });
  } catch (err) {
    return checkoutErrorResponse(err);
  }
}

export async function DELETE(request: Request, ctx: Ctx) {
  const { id, funnelId, stepId } = await ctx.params;
  const access = await requireSubAccountAdmin(request, id);
  if (access instanceof NextResponse) return access;
  try {
    await deleteStep(id, funnelId, stepId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return checkoutErrorResponse(err);
  }
}
