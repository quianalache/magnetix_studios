import "server-only";

import { NextResponse } from "next/server";
import { listDuplicateGroups } from "@/lib/server/contact-tags/service";
import { tagErrorResponse, tagRouteAccess } from "@/lib/server/contact-tags/route-helpers";

export const dynamic = "force-dynamic";

/** Possible duplicates (spelling variants / near-identical names) for review. */
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: subAccountId } = await ctx.params;
  const access = await tagRouteAccess(request, subAccountId);
  if (access instanceof NextResponse) return access;
  try {
    return NextResponse.json({ groups: await listDuplicateGroups(subAccountId, access.territoryIds), canManage: access.canManage });
  } catch (err) {
    return tagErrorResponse(err);
  }
}
