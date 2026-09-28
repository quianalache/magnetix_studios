import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { createAsset, listAssets, listOfferBundles, type AssetInput } from "@/lib/server/asset-service";
import { AssetsInputError, parseResourceInput } from "@/lib/server/assets/inputs";
import { tenantOf } from "@/lib/server/assets/media-library-service";
import { isoOf, memberNames } from "@/lib/server/assets/people";

/** Resource Library: list (with who last updated each) + create. */
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: subAccountId } = await ctx.params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;
  const [assets, bundles] = await Promise.all([listAssets(subAccountId), listOfferBundles(subAccountId)]);
  const names = await memberNames(subAccountId, assets.map((a) => a.updatedByUid ?? a.createdByUid));
  return NextResponse.json({
    ok: true,
    assets: assets.map((a) => ({
      ...a,
      createdAt: isoOf(a.createdAt),
      updatedAt: isoOf(a.updatedAt),
      updatedByName: names.get((a.updatedByUid ?? a.createdByUid) as string) ?? null,
    })),
    // Legacy offer bundles are shown read-only (never deleted automatically).
    legacyBundles: bundles.map((b) => ({ id: b.id, name: b.name, description: b.description, assetCount: (b.assetIds ?? []).length, linkedOfferId: b.linkedOfferId })),
  });
}

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: subAccountId } = await ctx.params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  try {
    const tenant = await tenantOf(subAccountId);
    const input = (await parseResourceInput(tenant, body, "create")) as AssetInput;
    const asset = await createAsset(tenant.agencyId || access.agencyId || "", subAccountId, input, access.uid);
    return NextResponse.json({ ok: true, asset }, { status: 201 });
  } catch (err) {
    if (err instanceof AssetsInputError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
