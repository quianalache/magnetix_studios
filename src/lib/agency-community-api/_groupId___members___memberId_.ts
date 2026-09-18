import "server-only";

import { NextResponse } from "next/server";
import { requireAgencyOwnerAny } from "@/lib/auth/require-tenancy";
import { removeAgencyGroupMemberServerSide } from "@/lib/server/community-agency-service";

export const dynamic = "force-dynamic";

/** Agency Community — revoke a member's access. Owner-only. Soft-delete
 *  (status "removed") — see removeAgencyGroupMemberServerSide. */
export async function DELETE(
  request: Request,
  ctx: { params: Promise<{ groupId: string; memberId: string }> },
) {
  const caller = await requireAgencyOwnerAny(request);
  if (caller instanceof NextResponse) return caller;
  const { groupId, memberId } = await ctx.params;

  await removeAgencyGroupMemberServerSide(caller.agencyId!, groupId, memberId);
  return NextResponse.json({ ok: true });
}
