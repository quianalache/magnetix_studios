import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";
import { loadTenantAsset, tenantOf } from "@/lib/server/assets/media-library-service";
import { enableReplayShare, revokeSharesForAsset } from "@/lib/server/assets/media-share-service";
import { mediaErrorResponse } from "@/lib/server/assets/media-route-helpers";

type Ctx = { params: Promise<{ id: string; assetId: string }> };

/**
 * Public replay link for ONE hosted video (sub-account admins).
 * POST `{expiresAt?: ISO | null}` turns sharing on (or changes the expiry);
 * DELETE turns it off. Videos stay protected unless this is used.
 */
export async function POST(request: Request, ctx: Ctx) {
  const { id: subAccountId, assetId } = await ctx.params;
  const access = await requireSubAccountAdmin(request, subAccountId);
  if (access instanceof NextResponse) return access;
  let body: Record<string, unknown> = {};
  try {
    body = ((await request.json()) as Record<string, unknown>) ?? {};
  } catch {
    body = {};
  }
  try {
    const asset = await loadTenantAsset(await tenantOf(subAccountId), assetId);
    const share = await enableReplayShare({
      asset,
      uid: access.uid,
      ...("expiresAt" in body ? { expiresAt: body.expiresAt } : {}),
    });
    return NextResponse.json({ share });
  } catch (err) {
    return mediaErrorResponse(err);
  }
}

export async function DELETE(request: Request, ctx: Ctx) {
  const { id: subAccountId, assetId } = await ctx.params;
  const access = await requireSubAccountAdmin(request, subAccountId);
  if (access instanceof NextResponse) return access;
  try {
    await loadTenantAsset(await tenantOf(subAccountId), assetId);
    const revoked = await revokeSharesForAsset(subAccountId, assetId, access.uid);
    return NextResponse.json({ ok: true, revoked });
  } catch (err) {
    return mediaErrorResponse(err);
  }
}
