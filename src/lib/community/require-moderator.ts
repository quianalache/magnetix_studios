import "server-only";

import { NextResponse } from "next/server";
import { requireGroupApiAccess } from "@/lib/community/member-context";

/** Community admin APIs (Access & Membership, Notifications & Digest): moderators only. */
export async function requireCommunityModerator(saId: string, groupId: string) {
  const access = await requireGroupApiAccess(saId, groupId);
  if (access.kind === "error") return NextResponse.json({ error: access.message }, { status: access.status });
  if (access.membership.role !== "moderator") return NextResponse.json({ error: "Only community admins can change this." }, { status: 403 });
  return access;
}
