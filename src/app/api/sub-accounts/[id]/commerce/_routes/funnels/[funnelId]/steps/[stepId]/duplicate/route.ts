import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";
import { checkoutErrorResponse, readBody } from "@/lib/server/checkout/common";
import { duplicateStep } from "@/lib/server/checkout/funnels-service";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string; funnelId: string; stepId: string }> };

/** Duplicate a step right after the original (admins). `{ pageMode: "copy" | "same" | "none" }` */
export async function POST(request: Request, ctx: Ctx) {
  const { id, funnelId, stepId } = await ctx.params;
  const access = await requireSubAccountAdmin(request, id);
  if (access instanceof NextResponse) return access;
  try {
    const body = await readBody(request);
    return NextResponse.json(await duplicateStep({ subAccountId: id, funnelId, stepId, uid: access.uid, pageMode: body.pageMode }), { status: 201 });
  } catch (err) {
    return checkoutErrorResponse(err);
  }
}
