import { NextResponse } from "next/server";
import { requireGroupApiAccess } from "@/lib/community/member-context";
import { updateGroupServerSide } from "@/lib/server/community-service";
import type { GroupJoinPolicy } from "@/types/community";

export const dynamic = "force-dynamic";

/**
 * Community Settings → General, member-facing save. Authorized by the
 * viewer's own `GroupMembership.role === "moderator"` — the same
 * in-community admin concept already used for post moderation and the
 * Members-page promote/demote actions (see
 * `/api/community/[saId]/[groupId]/members/[memberId]`). No second admin
 * system: staff keep their existing, separate
 * `/api/sub-accounts/[id]/community/[groupId]` route (Firebase-auth gated)
 * for the full settings surface; this route is the member/moderator entry
 * point for just the General fields, calling the SAME
 * `updateGroupServerSide` write path so both surfaces edit one underlying
 * record. Deliberately whitelists only the General-tab fields — the other
 * Settings sections (Branding, Navigation & Channels, Access & Membership,
 * etc.) are out of scope for this task and have no write path here.
 */
export async function PATCH(
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
    aboutHtml?: string;
    slug?: string;
    joinPolicy?: GroupJoinPolicy;
    logoUrl?: string | null;
    coverUrl?: string | null;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const group = await updateGroupServerSide({
    subAccountId: saId,
    groupId,
    patch: {
      name: body.name,
      aboutHtml: body.aboutHtml,
      slug: body.slug,
      joinPolicy: body.joinPolicy,
      logoUrl: body.logoUrl,
      coverUrl: body.coverUrl,
    },
  });
  if (!group) {
    return NextResponse.json({ error: "Group not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, group });
}
