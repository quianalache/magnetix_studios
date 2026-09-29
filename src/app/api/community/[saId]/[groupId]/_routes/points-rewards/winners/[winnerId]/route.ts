import { NextResponse } from "next/server";
import { requireGroupApiAccess } from "@/lib/community/member-context";
import { updateWinnerFulfillmentServerSide } from "@/lib/server/community-rewards-service";
import type { WinnerFulfillmentStatus } from "@/types/points-rewards";

export const dynamic = "force-dynamic";

/** Moderator-only. Marks a winner's fulfillment pending/fulfilled, with
 *  optional notes (e.g. "sent Calendly link 8/22"). */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ saId: string; groupId: string; winnerId: string }> },
) {
  const { saId, groupId, winnerId } = await params;
  const access = await requireGroupApiAccess(saId, groupId);
  if (access.kind === "error") {
    return NextResponse.json({ error: access.message }, { status: access.status });
  }
  if (access.membership.role !== "moderator") {
    return NextResponse.json({ error: "Moderators only" }, { status: 403 });
  }

  let body: { fulfillmentStatus?: WinnerFulfillmentStatus; notes?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (body.fulfillmentStatus !== "pending" && body.fulfillmentStatus !== "fulfilled") {
    return NextResponse.json({ error: "Invalid fulfillmentStatus" }, { status: 400 });
  }

  await updateWinnerFulfillmentServerSide({
    subAccountId: saId,
    groupId,
    winnerId,
    fulfillmentStatus: body.fulfillmentStatus,
    notes: body.notes,
  });
  return NextResponse.json({ ok: true });
}
