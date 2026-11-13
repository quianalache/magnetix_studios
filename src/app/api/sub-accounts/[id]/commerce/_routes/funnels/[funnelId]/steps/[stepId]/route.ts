import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";
import { checkoutErrorResponse, readBody } from "@/lib/server/checkout/common";
import { deleteStep, getStep, updateStep } from "@/lib/server/checkout/funnels-service";
import { stepOfferSettingsPayload } from "@/lib/server/checkout/funnel-offer-service";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string; funnelId: string; stepId: string }> };

/**
 * Upsell / Downsell Step Settings data: the step's Offer, payment and CRM
 * settings plus this workspace's Offers, Workflows and card-payment status
 * (read only — no Stripe call).
 */
export async function GET(request: Request, ctx: Ctx) {
  const { id, funnelId, stepId } = await ctx.params;
  const access = await requireSubAccountAdmin(request, id);
  if (access instanceof NextResponse) return access;
  try {
    const { step } = await getStep(id, funnelId, stepId);
    if (step.type !== "upsell" && step.type !== "downsell") return NextResponse.json({ error: "Only Upsell and Downsell steps sell an Offer here." }, { status: 400 });
    return NextResponse.json(await stepOfferSettingsPayload(id, step.offer));
  } catch (err) {
    return checkoutErrorResponse(err);
  }
}

/** Rename a step, set its page (`copyPage` assigns an independent copy) or its Accept / Decline routing. `{ name?, pageId?, copyPage?, routing?, offer? }` (`offer`: Upsell / Downsell Offer, payment and CRM settings — stored only, never executed on save) */
export async function PATCH(request: Request, ctx: Ctx) {
  const { id, funnelId, stepId } = await ctx.params;
  const access = await requireSubAccountAdmin(request, id);
  if (access instanceof NextResponse) return access;
  try {
    return NextResponse.json({ step: await updateStep(id, funnelId, stepId, await readBody(request), access.uid) });
  } catch (err) {
    return checkoutErrorResponse(err);
  }
}

export async function DELETE(request: Request, ctx: Ctx) {
  const { id, funnelId, stepId } = await ctx.params;
  const access = await requireSubAccountAdmin(request, id);
  if (access instanceof NextResponse) return access;
  try {
    return NextResponse.json({ ok: true, ...(await deleteStep(id, funnelId, stepId)) });
  } catch (err) {
    return checkoutErrorResponse(err);
  }
}
