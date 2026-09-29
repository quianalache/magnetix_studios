import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { authorizedMediaUrl, tenantOf } from "@/lib/server/assets/media-library-service";
import { mediaErrorResponse } from "@/lib/server/assets/media-route-helpers";

export const dynamic = "force-dynamic";

/**
 * Short-lived URL to preview / open / download a file for a member of THIS
 * sub-account (`?download=1` for an attachment). Nothing permanent is ever
 * returned: signed file URLs last 15 minutes, Bunny embed tokens 5.
 */
export async function GET(request: Request, ctx: { params: Promise<{ id: string; assetId: string }> }) {
  const { id: subAccountId, assetId } = await ctx.params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;
  const download = new URL(request.url).searchParams.get("download") === "1";
  try {
    const res = await authorizedMediaUrl(await tenantOf(subAccountId), assetId, download ? "attachment" : "inline");
    return NextResponse.json(res, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return mediaErrorResponse(err);
  }
}
