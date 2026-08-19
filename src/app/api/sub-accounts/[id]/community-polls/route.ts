import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { listPollsForSubAccount } from "@/lib/server/community-poll-admin";

/** Staff/owner: list every Community poll for this sub-account, across
 *  every group — the Forms & Quizzes-hosted "Community Polls" list page. */
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: subAccountId } = await ctx.params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;

  const polls = await listPollsForSubAccount(subAccountId);
  return NextResponse.json({ ok: true, polls });
}
