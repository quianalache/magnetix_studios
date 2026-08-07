import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { deleteAsset, getAsset, updateAsset, type AssetInput } from "@/lib/server/asset-service";
import { ASSET_STATUSES } from "@/types/assets";
import type { AssetIncludedIn, AssetStatus } from "@/types/assets";

function str(v: unknown, max = 2000): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}
function nullableStr(v: unknown): string | null {
  const s = str(v, 200);
  return s || null;
}

export async function PATCH(
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

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const patch: Partial<AssetInput> = {};
  if (typeof body.name === "string") patch.name = str(body.name, 200);
  if (typeof body.type === "string") patch.type = str(body.type, 80);
  if (typeof body.description === "string") patch.description = str(body.description, 5000);
  if ((ASSET_STATUSES as readonly string[]).includes(body.status as string)) {
    patch.status = body.status as AssetStatus;
  }
  if (Array.isArray(body.tags)) {
    patch.tags = body.tags.filter((t): t is string => typeof t === "string").slice(0, 20);
  } else if (typeof body.tags === "string") {
    patch.tags = body.tags.split(",").map((t) => t.trim()).filter(Boolean).slice(0, 20);
  }
  if (typeof body.accessLevel === "string") patch.accessLevel = str(body.accessLevel, 80);
  if (
    body.includedIn === "standard_membership" ||
    body.includedIn === "premium_membership" ||
    body.includedIn === "sold_standalone" ||
    body.includedIn === null
  ) {
    patch.includedIn = body.includedIn as AssetIncludedIn;
  }
  if (typeof body.directLink === "string") patch.directLink = str(body.directLink, 1000);
  if (typeof body.communitySafeLink === "string") patch.communitySafeLink = str(body.communitySafeLink, 1000);
  if (typeof body.landingPageLink === "string") patch.landingPageLink = str(body.landingPageLink, 1000);
  if (typeof body.checkoutLink === "string") patch.checkoutLink = str(body.checkoutLink, 1000);
  if ("linkedProjectId" in body) patch.linkedProjectId = nullableStr(body.linkedProjectId);
  if ("linkedContentId" in body) patch.linkedContentId = nullableStr(body.linkedContentId);
  if ("linkedGoalId" in body) patch.linkedGoalId = nullableStr(body.linkedGoalId);
  if ("linkedOfferId" in body) patch.linkedOfferId = nullableStr(body.linkedOfferId);
  if (typeof body.internalNotes === "string") patch.internalNotes = str(body.internalNotes, 5000);

  await updateAsset(assetId, patch);
  return NextResponse.json({ ok: true });
}

export async function DELETE(
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

  await deleteAsset(assetId);
  return NextResponse.json({ ok: true });
}
