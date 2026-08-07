import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { getAdminDb } from "@/lib/firebase/admin";
import { createOfferBundle, listOfferBundles } from "@/lib/server/asset-service";

/** Bundle shell — groups Assets, optionally linked to a real Course Offer for revenue rollup. Creation dialog fields aren't confirmed against the real popup yet, so this stays minimal (name/description/assets/offer) until that's screenshotted. */

export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: subAccountId } = await ctx.params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;
  const bundles = await listOfferBundles(subAccountId);
  return NextResponse.json({ ok: true, bundles });
}

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: subAccountId } = await ctx.params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 200) : "";
  if (!name) {
    return NextResponse.json({ error: "Bundle name is required" }, { status: 400 });
  }

  const subSnap = await getAdminDb().doc(`subAccounts/${subAccountId}`).get();
  const agencyId = (subSnap.data()?.agencyId as string) ?? access.agencyId ?? "";

  const bundle = await createOfferBundle({
    agencyId,
    subAccountId,
    name,
    description: typeof body.description === "string" ? body.description.trim().slice(0, 2000) : "",
    assetIds: Array.isArray(body.assetIds) ? body.assetIds.filter((a): a is string => typeof a === "string") : [],
    linkedOfferId: typeof body.linkedOfferId === "string" && body.linkedOfferId ? body.linkedOfferId : null,
  });
  return NextResponse.json({ ok: true, bundle }, { status: 201 });
}
