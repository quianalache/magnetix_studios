import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";
import { refreshHostedVideo, tenantOf } from "@/lib/server/assets/media-library-service";
import { mediaErrorResponse } from "@/lib/server/assets/media-route-helpers";

/** Re-check a hosted video's processing status with Bunny (the existing sync). */
export async function POST(request: Request, ctx: { params: Promise<{ id: string; assetId: string }> }) {
  const { id: subAccountId, assetId } = await ctx.params;
  const access = await requireSubAccountAdmin(request, subAccountId);
  if (access instanceof NextResponse) return access;
  try {
    return NextResponse.json({ item: await refreshHostedVideo(await tenantOf(subAccountId), assetId) });
  } catch (err) {
    return mediaErrorResponse(err);
  }
}
