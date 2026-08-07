import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { computeAssetRevenueCents, getAsset } from "@/lib/server/asset-service";

export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string; assetId: string }> },
) {
  const { id: subAccountId, assetId } = await ctx.params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;

  const asset = await getAsset(assetId);
  if (!asset || asset.subAccountId !== subAccountId) {
    return NextResponse.json({ error: "Asset not found" }, { status: 404 });
  }

  const revenueCents = await computeAssetRevenueCents(subAccountId, asset.linkedOfferId);
  return NextResponse.json({ ok: true, revenueCents });
}
