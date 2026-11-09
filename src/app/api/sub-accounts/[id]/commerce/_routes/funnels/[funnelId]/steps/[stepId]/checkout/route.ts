import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountAdmin, requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { checkoutErrorResponse, readBody } from "@/lib/server/checkout/common";
import { getStep, listSteps } from "@/lib/server/checkout/funnels-service";
import { checkoutEditorPayload, getStepCheckoutConfig, saveStepCheckoutConfig } from "@/lib/server/checkout/config-service";
import { listWorkspacePages } from "@/lib/server/checkout/pages";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string; funnelId: string; stepId: string }> };

/** Checkout Step settings + what the editor needs (Offers, steps, pages). */
export async function GET(request: Request, ctx: Ctx) {
  const { id, funnelId, stepId } = await ctx.params;
  const access = await requireSubAccountMember(request, id);
  if (access instanceof NextResponse) return access;
  try {
    const { funnel, step } = await getStep(id, funnelId, stepId);
    const config = await getStepCheckoutConfig(id, funnelId, stepId);
    const [payload, steps, pages] = await Promise.all([checkoutEditorPayload(id, config), listSteps(funnelId), listWorkspacePages(id)]);
    return NextResponse.json({ ...payload, funnel, step, steps, pages });
  } catch (err) {
    return checkoutErrorResponse(err);
  }
}

export async function PUT(request: Request, ctx: Ctx) {
  const { id, funnelId, stepId } = await ctx.params;
  const access = await requireSubAccountAdmin(request, id);
  if (access instanceof NextResponse) return access;
  try {
    const config = await saveStepCheckoutConfig({ subAccountId: id, funnelId, stepId, uid: access.uid, body: await readBody(request) });
    return NextResponse.json(await checkoutEditorPayload(id, config));
  } catch (err) {
    return checkoutErrorResponse(err);
  }
}
