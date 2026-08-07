import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { getAdminDb } from "@/lib/firebase/admin";
import { createAsset, listAssets, type AssetInput } from "@/lib/server/asset-service";
import type { AssetIncludedIn, AssetStatus } from "@/types/assets";

function str(v: unknown, max = 2000): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}
function nullableStr(v: unknown): string | null {
  const s = str(v, 200);
  return s || null;
}
function parseInput(body: Record<string, unknown>): AssetInput {
  const status: AssetStatus =
    body.status === "inactive" || body.status === "archived" ? body.status : "active";
  const includedIn: AssetIncludedIn =
    body.includedIn === "standard_membership" ||
    body.includedIn === "premium_membership" ||
    body.includedIn === "sold_standalone"
      ? body.includedIn
      : null;
  return {
    name: str(body.name, 200),
    type: str(body.type, 80),
    description: str(body.description, 5000),
    status,
    tags: Array.isArray(body.tags)
      ? body.tags.filter((t): t is string => typeof t === "string").slice(0, 20)
      : typeof body.tags === "string"
        ? body.tags.split(",").map((t) => t.trim()).filter(Boolean).slice(0, 20)
        : [],
    accessLevel: str(body.accessLevel, 80),
    includedIn,
    directLink: str(body.directLink, 1000),
    communitySafeLink: str(body.communitySafeLink, 1000),
    landingPageLink: str(body.landingPageLink, 1000),
    checkoutLink: str(body.checkoutLink, 1000),
    linkedProjectId: nullableStr(body.linkedProjectId),
    linkedContentId: nullableStr(body.linkedContentId),
    linkedGoalId: nullableStr(body.linkedGoalId),
    linkedOfferId: nullableStr(body.linkedOfferId),
    internalNotes: str(body.internalNotes, 5000),
  };
}

export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: subAccountId } = await ctx.params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;
  const assets = await listAssets(subAccountId);
  return NextResponse.json({ ok: true, assets });
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
  const input = parseInput(body);
  if (!input.name) {
    return NextResponse.json({ error: "Asset name is required" }, { status: 400 });
  }

  const subSnap = await getAdminDb().doc(`subAccounts/${subAccountId}`).get();
  const agencyId = (subSnap.data()?.agencyId as string) ?? access.agencyId ?? "";

  const asset = await createAsset(agencyId, subAccountId, input);
  return NextResponse.json({ ok: true, asset }, { status: 201 });
}
