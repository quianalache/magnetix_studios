import { NextResponse } from "next/server";
import { requireGroupApiAccess } from "@/lib/community/member-context";
import { displayNameFor, votePollServerSide } from "@/lib/server/community-feed-service";

export const dynamic = "force-dynamic";

/**
 * Member: cast or change a vote on a poll — `{ optionIds: string[] }`.
 * Available to every active group member (not moderator-gated — creating
 * a poll is a moderator action, voting on one is a normal member action).
 * Re-submitting updates the member's existing vote rather than creating a
 * second one (Part 7) — see `votePollServerSide` for the transactional
 * detail. Closing is re-enforced here, not just relied on from a disabled
 * client button (Part 6).
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ saId: string; groupId: string; postId: string }> },
) {
  const { saId, groupId, postId } = await params;
  const access = await requireGroupApiAccess(saId, groupId);
  if (access.kind === "error") {
    return NextResponse.json({ error: access.message }, { status: access.status });
  }

  let body: { optionIds?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const optionIds = Array.isArray(body.optionIds)
    ? body.optionIds.filter((id): id is string => typeof id === "string")
    : [];

  const result = await votePollServerSide({
    subAccountId: saId,
    groupId,
    postId,
    memberId: access.member.id,
    memberDisplayName: displayNameFor(access.member),
    viewerIsModerator: access.membership.role === "moderator",
    optionIds,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ ok: true, poll: result.poll });
}
