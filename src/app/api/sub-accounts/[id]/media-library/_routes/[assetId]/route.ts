import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountAdmin, requireSubAccountMember } from "@/lib/auth/require-tenancy";
import {
  deleteMediaLibraryAsset,
  getMediaLibraryItem,
  tenantOf,
  updateMediaLibraryFields,
} from "@/lib/server/assets/media-library-service";
import { mediaErrorResponse } from "@/lib/server/assets/media-route-helpers";

type Ctx = { params: Promise<{ id: string; assetId: string }> };

export async function GET(request: Request, ctx: Ctx) {
  const { id: subAccountId, assetId } = await ctx.params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;
  try {
    return NextResponse.json({ item: await getMediaLibraryItem(await tenantOf(subAccountId), assetId) });
  } catch (err) {
    return mediaErrorResponse(err);
  }
}

/** Rename / retag (sub-account admins). */
export async function PATCH(request: Request, ctx: Ctx) {
  const { id: subAccountId, assetId } = await ctx.params;
  const access = await requireSubAccountAdmin(request, subAccountId);
  if (access instanceof NextResponse) return access;
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  try {
    return NextResponse.json({ item: await updateMediaLibraryFields(await tenantOf(subAccountId), access.uid, assetId, body) });
  } catch (err) {
    return mediaErrorResponse(err);
  }
}

/** Safe delete (sub-account admins): refused while a lesson or resource uses the file; replay links are revoked. */
export async function DELETE(request: Request, ctx: Ctx) {
  const { id: subAccountId, assetId } = await ctx.params;
  const access = await requireSubAccountAdmin(request, subAccountId);
  if (access instanceof NextResponse) return access;
  try {
    await deleteMediaLibraryAsset(await tenantOf(subAccountId), assetId, access.uid);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return mediaErrorResponse(err);
  }
}
