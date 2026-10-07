import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { getContentSetUsage } from "@/lib/server/content-set-service";
import { contentSetErrorResponse } from "@/lib/server/content-set-route-helpers";

/** The Report Designs that really reference this set (the "Used in" popover). */
export async function GET(request: Request, ctx: { params: Promise<{ id: string; setId: string }> }) {
  const { id: subAccountId, setId } = await ctx.params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;
  try {
    return NextResponse.json({ ok: true, usage: await getContentSetUsage(subAccountId, setId) });
  } catch (err) {
    return contentSetErrorResponse(err);
  }
}
