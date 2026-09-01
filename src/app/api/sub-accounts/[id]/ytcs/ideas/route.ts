import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { listIdeas } from "@/lib/server/ytcs-service";

/**
 * GET /api/sub-accounts/[id]/ytcs/ideas — read-only in Phase 1. Saved
 * Ideas' own add/edit/delete UI is explicitly out of scope for this
 * phase (migration spec's Phase 3); this exists only so the Dashboard
 * and the minimal Saved Ideas stub page can show the real count/list.
 */
export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: subAccountId } = await ctx.params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;

  const ideas = await listIdeas(subAccountId);
  return NextResponse.json({ ok: true, ideas });
}
