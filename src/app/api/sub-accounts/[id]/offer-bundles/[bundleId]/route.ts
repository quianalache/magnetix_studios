import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { computeBundleRevenueCents, deleteOfferBundle, listOfferBundles } from "@/lib/server/asset-service";

export async function DELETE(
  request: Request,
  ctx: { params: Promise<{ id: string; bundleId: string }> },
) {
  const { id: subAccountId, bundleId } = await ctx.params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;
  await deleteOfferBundle(bundleId);
  return NextResponse.json({ ok: true });
}

export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string; bundleId: string }> },
) {
  const { id: subAccountId, bundleId } = await ctx.params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;
  const bundles = await listOfferBundles(subAccountId);
  const bundle = bundles.find((b) => b.id === bundleId);
  if (!bundle) return NextResponse.json({ error: "Bundle not found" }, { status: 404 });
  const revenueCents = await computeBundleRevenueCents(subAccountId, bundle.linkedOfferId);
  return NextResponse.json({ ok: true, bundle, revenueCents });
}
