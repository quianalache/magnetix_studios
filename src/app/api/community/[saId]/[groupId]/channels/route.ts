import "server-only";

import { NextResponse } from "next/server";
import { requireGroupApiAccess } from "@/lib/community/member-context";
import {
  createChannelServerSide,
  listChannelsAndSectionsForViewer,
} from "@/lib/server/community-channels-service";

export const dynamic = "force-dynamic";

/** Any active member: the left rail's own read — already viewer-filtered
 *  (private channels/sections excluded for non-moderators) server-side, not
 *  just hidden by the UI. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ saId: string; groupId: string }> },
) {
  const { saId, groupId } = await params;
  const access = await requireGroupApiAccess(saId, groupId);
  if (access.kind === "error") {
    return NextResponse.json({ error: access.message }, { status: access.status });
  }
  try {
    const data = await listChannelsAndSectionsForViewer({
      subAccountId: saId,
      groupId,
      isModerator: access.membership.role === "moderator",
    });
    return NextResponse.json({ ok: true, ...data });
  } catch (err) {
    console.error("[community/channels] list failed", err);
    return NextResponse.json({ error: "Couldn't load channels" }, { status: 500 });
  }
}

/** Moderator-only: create a Channel. Enforced HERE server-side regardless
 *  of whether the left rail's own "+" was correctly hidden for this member
 *  — same boundary convention as every other admin action in Community. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ saId: string; groupId: string }> },
) {
  const { saId, groupId } = await params;
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
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.name?.trim()) {
    return NextResponse.json({ error: "Channel name is required" }, { status: 400 });
  }
  if (!body.icon?.trim()) {
    return NextResponse.json({ error: "Choose an icon" }, { status: 400 });
  }

  try {
    const channel = await createChannelServerSide({
      subAccountId: saId,
      groupId,
      name: body.name,
      icon: body.icon,
      description: body.description,
      private: body.private,
      readOnly: body.readOnly,
      sectionId: body.sectionId ?? null,
    });
    return NextResponse.json({ ok: true, channel });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Couldn't create channel" },
      { status: 400 },
    );
  }
}
