import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";
import { checkoutErrorResponse, readBody } from "@/lib/server/checkout/common";
import { moveStepToFunnel } from "@/lib/server/checkout/funnels-service";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string; funnelId: string; stepId: string }> };

/**
 * Move this step's page to another funnel of the same workspace (admins).
 * `{ targetFunnelId, confirm? }` — without `confirm: true` it only returns a
 * preview (`{ preview: { blockers, warnings, … } }`) and changes nothing.
 */
export async function POST(request: Request, ctx: Ctx) {
  const { id, funnelId, stepId } = await ctx.params;
  const access = await requireSubAccountAdmin(request, id);
  if (access instanceof NextResponse) return access;
  try {
    return NextResponse.json(await moveStepToFunnel({ subAccountId: id, funnelId, stepId, uid: access.uid, body: await readBody(request) }));
  } catch (err) {
    return checkoutErrorResponse(err);
  }
}
