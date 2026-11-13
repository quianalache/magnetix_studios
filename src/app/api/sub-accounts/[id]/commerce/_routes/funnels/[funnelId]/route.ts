import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountAdmin, requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { checkoutErrorResponse, readBody } from "@/lib/server/checkout/common";
import { archiveFunnel, getFunnelHub, updateFunnel } from "@/lib/server/checkout/funnels-service";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string; funnelId: string }> };

export async function GET(request: Request, ctx: Ctx) {
  const { id, funnelId } = await ctx.params;
  const access = await requireSubAccountMember(request, id);
  if (access instanceof NextResponse) return access;
  try {
    // Funnel hub (Phase 2): funnel, steps, workspace pages, checkout summaries, routing issues.
    return NextResponse.json(await getFunnelHub(id, funnelId));
  } catch (err) {
    return checkoutErrorResponse(err);
  }
}

/** Rename / publish / unpublish. */
export async function PATCH(request: Request, ctx: Ctx) {
  const { id, funnelId } = await ctx.params;
  const access = await requireSubAccountAdmin(request, id);
  if (access instanceof NextResponse) return access;
  try {
    return NextResponse.json({ funnel: await updateFunnel(id, funnelId, await readBody(request)) });
  } catch (err) {
    return checkoutErrorResponse(err);
  }
}

/** Archive (never hard-deletes; orders keep their funnel reference). */
export async function DELETE(request: Request, ctx: Ctx) {
  const { id, funnelId } = await ctx.params;
  const access = await requireSubAccountAdmin(request, id);
  if (access instanceof NextResponse) return access;
  try {
    await archiveFunnel(id, funnelId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return checkoutErrorResponse(err);
  }
}
