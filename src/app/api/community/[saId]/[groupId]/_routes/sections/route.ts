import "server-only";

import { NextResponse } from "next/server";
import { requireGroupApiAccess } from "@/lib/community/member-context";
import { createSectionServerSide } from "@/lib/server/community-channels-service";

export const dynamic = "force-dynamic";

/** Moderator-only: create a Section. Reads happen through the channels
 *  list endpoint (GET /channels already returns sections alongside
 *  channels) — no separate GET here. */
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

  let body: { name?: string; icon?: string; private?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.name?.trim()) {
    return NextResponse.json({ error: "Section name is required" }, { status: 400 });
  }
  if (!body.icon?.trim()) {
    return NextResponse.json({ error: "Choose an icon" }, { status: 400 });
  }

  try {
    const section = await createSectionServerSide({
      subAccountId: saId,
      groupId,
      name: body.name,
      icon: body.icon,
      private: body.private,
    });
    return NextResponse.json({ ok: true, section });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Couldn't create section" },
      { status: 400 },
    );
  }
}
