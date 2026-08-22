import { NextResponse } from "next/server";
import { requireGroupApiAccess } from "@/lib/community/member-context";
import { updateLevelsServerSide, LevelValidationError } from "@/lib/server/community-points-service";
import type { CommunityLevel } from "@/types/points-rewards";

export const dynamic = "force-dynamic";

/** Community Settings → Points & Rewards → Levels. Moderator-only, full
 *  replace of the 9-level set, validated server-side before save — see
 *  `updateLevelsServerSide`'s doc comment for the exact rules. */
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

  let body: { levels?: CommunityLevel[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body.levels) {
    return NextResponse.json({ error: "Missing levels" }, { status: 400 });
  }

  try {
    const config = await updateLevelsServerSide({
      subAccountId: saId,
      groupId,
      levels: body.levels,
      updatedBy: access.member.id,
    });
    return NextResponse.json({ ok: true, config });
  } catch (err) {
    const status = err instanceof LevelValidationError ? 400 : 500;
    const message = err instanceof Error ? err.message : "Couldn't save levels";
    return NextResponse.json({ error: message }, { status });
  }
}
