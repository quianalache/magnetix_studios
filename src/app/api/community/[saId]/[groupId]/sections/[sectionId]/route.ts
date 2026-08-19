import "server-only";

import { NextResponse } from "next/server";
import { requireGroupApiAccess } from "@/lib/community/member-context";
import {
  deleteSectionServerSide,
  updateSectionServerSide,
} from "@/lib/server/community-channels-service";

export const dynamic = "force-dynamic";

/** Moderator-only: edit a Section (name/icon/private/order). */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ saId: string; groupId: string; sectionId: string }> },
) {
  const { saId, groupId, sectionId } = await params;
  const access = await requireGroupApiAccess(saId, groupId);
  if (access.kind === "error") {
    return NextResponse.json({ error: access.message }, { status: access.status });
  }
  if (access.membership.role !== "moderator") {
    return NextResponse.json({ error: "Moderators only" }, { status: 403 });
  }

  let body: { name?: string; icon?: string; private?: boolean; order?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  try {
    const section = await updateSectionServerSide(saId, groupId, sectionId, body);
    if (!section) return NextResponse.json({ error: "Section not found" }, { status: 404 });
    return NextResponse.json({ ok: true, section });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Couldn't save section" },
      { status: 400 },
    );
  }
}

/** Moderator-only: delete a Section. Never deletes contained Channels —
 *  they become unsectioned (see deleteSectionServerSide). */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ saId: string; groupId: string; sectionId: string }> },
) {
  const { saId, groupId, sectionId } = await params;
  const access = await requireGroupApiAccess(saId, groupId);
  if (access.kind === "error") {
    return NextResponse.json({ error: access.message }, { status: access.status });
  }
  if (access.membership.role !== "moderator") {
    return NextResponse.json({ error: "Moderators only" }, { status: 403 });
  }

  const result = await deleteSectionServerSide(saId, groupId, sectionId);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ ok: true, unsectionedCount: result.unsectionedCount });
}
