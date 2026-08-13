import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";
import { getAdminDb } from "@/lib/firebase/admin";
import {
  listCommunityTiers,
  replaceCommunityTiersServerSide,
} from "@/lib/server/community-service";
import type { CommunityTier } from "@/types/community";

export const dynamic = "force-dynamic";

async function requireCommunityAdmin(request: Request, subAccountId: string) {
  const access = await requireSubAccountAdmin(request, subAccountId);
  if (access instanceof NextResponse) return access;
  const subSnap = await getAdminDb().doc(`subAccounts/${subAccountId}`).get();
  if (subSnap.data()?.communityEnabledByAgency !== true) {
    return NextResponse.json(
      { error: "Community is disabled for this sub-account." },
      { status: 403 },
    );
  }
  return access;
}

export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string; groupId: string }> },
) {
  const { id: subAccountId, groupId } = await ctx.params;
  const access = await requireCommunityAdmin(request, subAccountId);
  if (access instanceof NextResponse) return access;
  const tiers = await listCommunityTiers({ subAccountId, groupId });
  return NextResponse.json({ ok: true, tiers });
}

export async function PUT(
  request: Request,
  ctx: { params: Promise<{ id: string; groupId: string }> },
) {
  const { id: subAccountId, groupId } = await ctx.params;
  const access = await requireCommunityAdmin(request, subAccountId);
  if (access instanceof NextResponse) return access;
  let body: { tiers?: Partial<CommunityTier>[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const tiers = await replaceCommunityTiersServerSide({
    subAccountId,
    groupId,
    tiers: body.tiers ?? [],
  });
  return NextResponse.json({ ok: true, tiers });
}
