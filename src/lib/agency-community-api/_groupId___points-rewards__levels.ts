import "server-only";

import { NextResponse } from "next/server";
import { resolveAgencyCommunityCaller } from "@/lib/server/agency-community-access";
import {
  updateAgencyLevelsServerSide,
  LevelValidationError,
} from "@/lib/server/agency-community-points-service";
import type { CommunityLevel } from "@/types/points-rewards";

export const dynamic = "force-dynamic";

/** Agency Community Settings → Points & Rewards → Levels. Owner-only, full
 *  replace of the 9-level set, validated server-side before save. */
export async function PATCH(request: Request, ctx: { params: Promise<{ groupId: string }> }) {
  const { groupId } = await ctx.params;
  const caller = await resolveAgencyCommunityCaller(request, groupId);
  if (caller instanceof NextResponse) return caller;
  if (caller.kind !== "owner") return NextResponse.json({ error: "Owner only" }, { status: 403 });

  let body: { levels?: CommunityLevel[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body.levels) return NextResponse.json({ error: "Missing levels" }, { status: 400 });

  try {
    const config = await updateAgencyLevelsServerSide({
      agencyId: caller.agencyId,
      groupId,
      levels: body.levels,
      updatedBy: caller.uid,
    });
    return NextResponse.json({ ok: true, config });
  } catch (err) {
    const status = err instanceof LevelValidationError ? 400 : 500;
    const message = err instanceof Error ? err.message : "Couldn't save levels";
    return NextResponse.json({ error: message }, { status });
  }
}
