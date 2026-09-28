import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { getRoutineHistory } from "@/lib/server/routines-service";
import { taskErrorResponse } from "@/lib/server/task-route-helpers";

/** Past occurrences, newest first. `?before=YYYY-MM-DD` pages backwards. */
export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string; routineId: string }> }
) {
  const { id: subAccountId, routineId } = await ctx.params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;
  const before = new URL(request.url).searchParams.get("before");
  try {
    return NextResponse.json(await getRoutineHistory({ subAccountId, routineId, before, viewer: { uid: access.uid, role: access.subAccountRole ?? null } }));
  } catch (err) {
    return taskErrorResponse(err);
  }
}
