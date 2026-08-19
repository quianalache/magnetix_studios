import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { getPollDetailForAdmin } from "@/lib/server/community-poll-admin";

/** Staff/owner: one poll's full response list — member, selected
 *  choice(s), vote timestamp. The per-poll "Responses" view. */
export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string; groupId: string; postId: string }> },
) {
  const { id: subAccountId, groupId, postId } = await ctx.params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;

  try {
    const detail = await getPollDetailForAdmin({ subAccountId, groupId, postId });
    if (!detail) {
      return NextResponse.json({ error: "Poll not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, poll: detail });
  } catch (err) {
    console.error("[community-polls] detail failed", err);
    return NextResponse.json({ error: "Couldn't load this poll" }, { status: 500 });
  }
}
