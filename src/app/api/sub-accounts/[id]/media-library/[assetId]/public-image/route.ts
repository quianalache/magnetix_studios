import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountAdmin, requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { tenantOf } from "@/lib/server/assets/media-library-service";
import { ensurePublicImage, removePublicImage } from "@/lib/server/assets/media-public-image-service";
import { mediaErrorResponse } from "@/lib/server/assets/media-route-helpers";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string; assetId: string }> };

/**
 * Public URL for a Media Library image used on a page, email or course
 * image. Any member gets the URL of an image that is ALREADY public; only
 * an admin can make a private image public (a separate public copy — the
 * original stays private). See media-public-image-service.
 */
export async function POST(request: Request, ctx: Ctx) {
  const { id: subAccountId, assetId } = await ctx.params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;
  const isAdmin = access.subAccountRole === "admin" || access.subAccountRole === "agencyOwner";
  try {
    const result = await ensurePublicImage(await tenantOf(subAccountId), access.uid, assetId, isAdmin);
    return NextResponse.json(result);
  } catch (err) {
    return mediaErrorResponse(err);
  }
}

/** Admin: turn the public link off (deletes the public copy only). */
export async function DELETE(request: Request, ctx: Ctx) {
  const { id: subAccountId, assetId } = await ctx.params;
  const access = await requireSubAccountAdmin(request, subAccountId);
  if (access instanceof NextResponse) return access;
  try {
    await removePublicImage(await tenantOf(subAccountId), assetId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return mediaErrorResponse(err);
  }
}
