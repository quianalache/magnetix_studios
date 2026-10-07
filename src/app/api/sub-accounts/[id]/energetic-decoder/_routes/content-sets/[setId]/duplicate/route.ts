import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";
import { duplicateContentSet } from "@/lib/server/content-set-service";
import { contentSetErrorResponse } from "@/lib/server/content-set-route-helpers";

/** Independent copy ("Name (copy)"), created as Draft. */
export async function POST(request: Request, ctx: { params: Promise<{ id: string; setId: string }> }) {
  const { id: subAccountId, setId } = await ctx.params;
  const access = await requireSubAccountAdmin(request, subAccountId);
  if (access instanceof NextResponse) return access;
  try {
    return NextResponse.json({ ok: true, set: await duplicateContentSet(subAccountId, access, setId) }, { status: 201 });
  } catch (err) {
    return contentSetErrorResponse(err);
  }
}
