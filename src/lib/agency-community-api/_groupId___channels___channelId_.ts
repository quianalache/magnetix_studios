import "server-only";

import { NextResponse } from "next/server";
import { requireAgencyOwnerAny } from "@/lib/auth/require-tenancy";
import {
  updateAgencyChannelServerSide,
  deleteAgencyChannelServerSide,
} from "@/lib/server/community-agency-service";

export const dynamic = "force-dynamic";

/** Agency Community — update/delete a channel. Owner-only. */
export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ groupId: string; channelId: string }> },
) {
  const caller = await requireAgencyOwnerAny(request);
  if (caller instanceof NextResponse) return caller;
  const { groupId, channelId } = await ctx.params;

  let body: {
    name?: string;
    icon?: string;
    description?: string;
    private?: boolean;
    readOnly?: boolean;
    sectionId?: string | null;
    order?: number;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const channel = await updateAgencyChannelServerSide(
      caller.agencyId!,
      groupId,
      channelId,
      body,
    );
    return NextResponse.json({ ok: true, channel });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Couldn't update channel" },
      { status: 400 },
    );
  }
}

export async function DELETE(
  request: Request,
  ctx: { params: Promise<{ groupId: string; channelId: string }> },
) {
  const caller = await requireAgencyOwnerAny(request);
  if (caller instanceof NextResponse) return caller;
  const { groupId, channelId } = await ctx.params;

  await deleteAgencyChannelServerSide(caller.agencyId!, groupId, channelId);
  return NextResponse.json({ ok: true });
}
