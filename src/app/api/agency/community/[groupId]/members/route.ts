import "server-only";

import { NextResponse } from "next/server";
import { requireAgencyOwnerAny } from "@/lib/auth/require-tenancy";
import {
  listAgencyGroupMembers,
  addAgencyGroupMemberServerSide,
} from "@/lib/server/community-agency-service";

export const dynamic = "force-dynamic";

/**
 * Agency Community — membership roster. Owner-only. NOTE: this is a
 * roster of eligible people for a future login/access system, not a
 * working authorization grant — see community-agency-service.ts's module
 * comment. Adding someone here does not currently let them sign in or
 * post; only the agency owner can do that today.
 */
export async function GET(
  request: Request,
  ctx: { params: Promise<{ groupId: string }> },
) {
  const caller = await requireAgencyOwnerAny(request);
  if (caller instanceof NextResponse) return caller;
  const { groupId } = await ctx.params;

  const members = await listAgencyGroupMembers(caller.agencyId!, groupId);
  return NextResponse.json({ members });
}

export async function POST(
  request: Request,
  ctx: { params: Promise<{ groupId: string }> },
) {
  const caller = await requireAgencyOwnerAny(request);
  if (caller instanceof NextResponse) return caller;
  const { groupId } = await ctx.params;

  let body: { email?: string; displayName?: string | null };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body.email?.trim()) {
    return NextResponse.json({ error: "Email is required." }, { status: 400 });
  }

  try {
    const member = await addAgencyGroupMemberServerSide({
      agencyId: caller.agencyId!,
      groupId,
      email: body.email,
      displayName: body.displayName,
      invitedByUid: caller.uid,
    });
    return NextResponse.json({ ok: true, member });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Couldn't add to roster" },
      { status: 400 },
    );
  }
}
