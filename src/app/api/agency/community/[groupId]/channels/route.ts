import "server-only";

import { NextResponse } from "next/server";
import { requireAgencyOwnerAny } from "@/lib/auth/require-tenancy";
import { resolveAgencyCommunityCaller } from "@/lib/server/agency-community-access";
import {
  createAgencyChannelServerSide,
  listAgencyChannelsAndSectionsForViewer,
} from "@/lib/server/community-agency-service";

export const dynamic = "force-dynamic";

/** Agency Community — list channels + sections, filtered for the viewer
 *  (private channels/sections a non-moderator can't see are never even
 *  sent to the client). Owner OR an active member. */
export async function GET(
  request: Request,
  ctx: { params: Promise<{ groupId: string }> },
) {
  const { groupId } = await ctx.params;
  const caller = await resolveAgencyCommunityCaller(request, groupId);
  if (caller instanceof NextResponse) return caller;

  const result = await listAgencyChannelsAndSectionsForViewer({
    agencyId: caller.agencyId,
    groupId,
    isModerator: caller.kind === "owner",
  });
  return NextResponse.json(result);
}

/** Agency Community — create a channel. Owner-only. */
export async function POST(
  request: Request,
  ctx: { params: Promise<{ groupId: string }> },
) {
  const caller = await requireAgencyOwnerAny(request);
  if (caller instanceof NextResponse) return caller;
  const { groupId } = await ctx.params;

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
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body.name?.trim()) {
    return NextResponse.json({ error: "Channel name is required." }, { status: 400 });
  }

  try {
    const channel = await createAgencyChannelServerSide({
      agencyId: caller.agencyId!,
      groupId,
      name: body.name,
      icon: body.icon ?? "💬",
      description: body.description,
      private: body.private,
      readOnly: body.readOnly,
      sectionId: body.sectionId,
    });
    return NextResponse.json({ ok: true, channel });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Couldn't create channel" },
      { status: 400 },
    );
  }
}
