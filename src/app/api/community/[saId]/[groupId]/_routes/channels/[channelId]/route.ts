import "server-only";

import { NextResponse } from "next/server";
import { requireGroupApiAccess } from "@/lib/community/member-context";
import {
  deleteChannelServerSide,
  updateChannelServerSide,
} from "@/lib/server/community-channels-service";

export const dynamic = "force-dynamic";

/** Moderator-only: edit a Channel (name/icon/description/private/readOnly/
 *  section). Renaming cascades to every post's `category` — see
 *  updateChannelServerSide's own comment. */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ saId: string; groupId: string; channelId: string }> },
) {
  const { saId, groupId, channelId } = await params;
  const access = await requireGroupApiAccess(saId, groupId);
  if (access.kind === "error") {
    return NextResponse.json({ error: access.message }, { status: access.status });
  }
  if (access.membership.role !== "moderator") {
    return NextResponse.json({ error: "Moderators only" }, { status: 403 });
  }

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
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  try {
    const channel = await updateChannelServerSide(saId, groupId, channelId, body);
    if (!channel) return NextResponse.json({ error: "Channel not found" }, { status: 404 });
    return NextResponse.json({ ok: true, channel });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Couldn't save channel" },
      { status: 400 },
    );
  }
}

/** Moderator-only: delete a Channel. Blocked (not silently cascaded) if the
 *  channel still has posts — see deleteChannelServerSide. */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ saId: string; groupId: string; channelId: string }> },
) {
  const { saId, groupId, channelId } = await params;
  const access = await requireGroupApiAccess(saId, groupId);
  if (access.kind === "error") {
    return NextResponse.json({ error: access.message }, { status: access.status });
  }
  if (access.membership.role !== "moderator") {
    return NextResponse.json({ error: "Moderators only" }, { status: 403 });
  }

  const result = await deleteChannelServerSide(saId, groupId, channelId);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
