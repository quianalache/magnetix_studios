import "server-only";

import { NextResponse } from "next/server";
import { requireAgencyOwnerAny } from "@/lib/auth/require-tenancy";
import {
  listAgencyGroupMembers,
  addAgencyGroupMemberServerSide,
} from "@/lib/server/community-agency-service";

export const dynamic = "force-dynamic";

/**
 * Agency Community — membership. Owner-only (inviting/managing members is
 * an owner action; the resulting membership itself is what grants the
 * invited person real access — see community-agency-service.ts and
 * agency-community-access.ts).
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
      origin: new URL(request.url).origin,
    });
    return NextResponse.json({ ok: true, member });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Couldn't add to roster" },
      { status: 400 },
    );
  }
}
