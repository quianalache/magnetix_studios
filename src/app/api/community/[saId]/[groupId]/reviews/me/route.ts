import { NextResponse } from "next/server";
import { getCurrentMember } from "@/lib/community/member-session";
import {
  removeCommunityReviewServerSide,
  upsertCommunityReviewServerSide,
} from "@/lib/server/community-service";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ saId: string; groupId: string }> },
) {
  const { saId, groupId } = await params;
  const member = await getCurrentMember(saId);
  if (!member) {
    return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  }
  let body: { rating?: number; body?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  try {
    const review = await upsertCommunityReviewServerSide({
      subAccountId: saId,
      groupId,
      memberId: member.id,
      rating: Number(body.rating ?? 0),
      body: body.body ?? "",
    });
    return NextResponse.json({ ok: true, review });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Couldn't save review" },
      { status: 400 },
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ saId: string; groupId: string }> },
) {
  void request;
  const { saId, groupId } = await params;
  const member = await getCurrentMember(saId);
  if (!member) {
    return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  }
  await removeCommunityReviewServerSide({
    subAccountId: saId,
    groupId,
    reviewId: member.id,
    removedByUid: null,
  });
  return NextResponse.json({ ok: true });
}
