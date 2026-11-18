import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";
import { checkoutErrorResponse, readBody } from "@/lib/server/checkout/common";
import { addPageStep, addStep, reorderSteps } from "@/lib/server/checkout/funnels-service";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string; funnelId: string }> };

/**
 * Add a step at the end.
 *  - Page-first "Add a page" (2026-11-17): `{ source: "blank" | "template" | "existing", name?, templateId?, pageId? }`
 *    → `{ step, notes }` (the page's role comes from its content; see addPageStep).
 *  - Legacy typed step: `{ type, name, pageId?, copyPage? }` → `{ step }`.
 */
export async function POST(request: Request, ctx: Ctx) {
  const { id, funnelId } = await ctx.params;
  const access = await requireSubAccountAdmin(request, id);
  if (access instanceof NextResponse) return access;
  try {
    const body = await readBody(request);
    if (body.source !== undefined) return NextResponse.json(await addPageStep({ subAccountId: id, funnelId, uid: access.uid, body }), { status: 201 });
    return NextResponse.json({ step: await addStep({ subAccountId: id, funnelId, uid: access.uid, body }) }, { status: 201 });
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
