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

  try {
    const polls = await listPollsForSubAccount(subAccountId);
    return NextResponse.json({ ok: true, polls });
  } catch (err) {
    // Surface as a real error response, not an unhandled 500 — the list
    // page distinguishes "load failed" from "genuinely no polls yet"
    // specifically so a real failure here (e.g. the Firestore
    // collection-group query needing its own field-override index, hit
    // live during QA) never renders as a misleadingly-empty page again.
    console.error("[community-polls] list failed", err);
    return NextResponse.json({ error: "Couldn't load Community polls" }, { status: 500 });
  }
}
