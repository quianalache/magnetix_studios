import "server-only";

import { NextResponse } from "next/server";
import { requireAgencyOwnerAny } from "@/lib/auth/require-tenancy";
import { cancelAgencyCommunication } from "@/lib/server/agency-communications-service";

export const dynamic = "force-dynamic";

/** Owner-only kill switch — mirrors POST /api/broadcasts/[broadcastId]/cancel. */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const caller = await requireAgencyOwnerAny(request);
  if (caller instanceof NextResponse) return caller;
  const { id } = await ctx.params;
  const result = await cancelAgencyCommunication(caller.agencyId!, id, { displayName: caller.email, email: caller.email });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 409 });
  return NextResponse.json({ ok: true });
}
