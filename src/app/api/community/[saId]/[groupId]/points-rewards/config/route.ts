import { NextResponse } from "next/server";
import { requireGroupApiAccess } from "@/lib/community/member-context";
import { getPointsConfig, updatePointRulesServerSide } from "@/lib/server/community-points-service";
import type { PointRuleMap } from "@/types/points-rewards";

export const dynamic = "force-dynamic";

/**
 * Community Settings → Points & Rewards → Points System. GET is
 * member-readable (every member needs the real, configured rules for
 * "How points work"); PATCH (full replace of `rules`) is moderator-only,
 * same in-community admin convention as every other Settings write route.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ saId: string; groupId: string }> },
) {
  const { saId, groupId } = await params;
  const access = await requireGroupApiAccess(saId, groupId);
  if (access.kind === "error") {
    return NextResponse.json({ error: access.message }, { status: access.status });
  }
  const config = await getPointsConfig(saId, groupId);
  return NextResponse.json({ ok: true, config });
}

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

  let body: { rules?: PointRuleMap };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body.rules) {
    return NextResponse.json({ error: "Missing rules" }, { status: 400 });
  }

  try {
    const config = await updatePointRulesServerSide({
      subAccountId: saId,
      groupId,
      rules: body.rules,
      updatedBy: access.member.id,
    });
    return NextResponse.json({ ok: true, config });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Couldn't save points rules";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
