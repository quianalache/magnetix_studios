import "server-only";

import { NextResponse } from "next/server";
import { recentOperations } from "@/lib/server/contact-tags/service";
import { tagErrorResponse, tagRouteAccess } from "@/lib/server/contact-tags/route-helpers";

export const dynamic = "force-dynamic";

/** Recent rename / merge / delete runs (admins) — a failed one can be run again. */
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: subAccountId } = await ctx.params;
  const access = await tagRouteAccess(request, subAccountId, { manage: true });
  if (access instanceof NextResponse) return access;
  try {
    return NextResponse.json({ operations: await recentOperations(subAccountId) });
  } catch (err) {
    return tagErrorResponse(err);
  }
}
