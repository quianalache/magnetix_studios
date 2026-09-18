import "server-only";

import { NextResponse } from "next/server";
import { requireAgencyOwnerAny } from "@/lib/auth/require-tenancy";
import { resendAgencyGroupInviteServerSide } from "@/lib/server/community-agency-service";

export const dynamic = "force-dynamic";

/** Agency Community — resend a member's invite email. Owner-only. */
export async function POST(
  request: Request,
  ctx: { params: Promise<{ groupId: string; memberId: string }> },
) {
  const caller = await requireAgencyOwnerAny(request);
  if (caller instanceof NextResponse) return caller;
  const { groupId, memberId } = await ctx.params;

  try {
    await resendAgencyGroupInviteServerSide(
      caller.agencyId!,
      groupId,
      memberId,
      new URL(request.url).origin,
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Couldn't resend invite" },
      { status: 400 },
    );
  }
}
