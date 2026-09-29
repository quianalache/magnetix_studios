import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { deleteAsset, updateAsset } from "@/lib/server/asset-service";
import { AssetsInputError, parseResourceInput } from "@/lib/server/assets/inputs";
import { tenantOf } from "@/lib/server/assets/media-library-service";

type Ctx = { params: Promise<{ id: string; assetId: string }> };

export async function PATCH(request: Request, ctx: Ctx) {
  const { id: subAccountId, assetId } = await ctx.params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  try {
    const patch = await parseResourceInput(await tenantOf(subAccountId), body, "patch");
    if (patch.sourceKind === "external") patch.mediaAssetId = null;
    const ok = await updateAsset(subAccountId, assetId, patch, access.uid);
    if (!ok) return NextResponse.json({ error: "Resource not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AssetsInputError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}

/** Deletes the resource record only. A linked Media Library file is kept (it may be used elsewhere). */
export async function DELETE(request: Request, ctx: Ctx) {
  const { id: subAccountId, assetId } = await ctx.params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;
  const ok = await deleteAsset(subAccountId, assetId);
  if (!ok) return NextResponse.json({ error: "Resource not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
