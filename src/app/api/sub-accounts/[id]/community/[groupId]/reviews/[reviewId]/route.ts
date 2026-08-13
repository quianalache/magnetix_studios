import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";
import { getAdminDb } from "@/lib/firebase/admin";
import { removeCommunityReviewServerSide } from "@/lib/server/community-service";

export const dynamic = "force-dynamic";

export async function DELETE(
  request: Request,
  ctx: { params: Promise<{ id: string; groupId: string; reviewId: string }> },
) {
  const { id: subAccountId, groupId, reviewId } = await ctx.params;
  const access = await requireSubAccountAdmin(request, subAccountId);
  if (access instanceof NextResponse) return access;
  const subSnap = await getAdminDb().doc(`subAccounts/${subAccountId}`).get();
  if (subSnap.data()?.communityEnabledByAgency !== true) {
    return NextResponse.json(
      { error: "Community is disabled for this sub-account." },
      { status: 403 },
    );
  }
  await removeCommunityReviewServerSide({
    subAccountId,
    groupId,
    reviewId,
    removedByUid: access.uid,
  });
  return NextResponse.json({ ok: true });
}
