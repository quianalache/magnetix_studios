import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { listRoutineActivities } from "@/lib/server/routines-service";
import { taskErrorResponse } from "@/lib/server/task-route-helpers";

/**
 * The caller's routine activities for My Tasks (their own routines + shared
 * ones). Routine activities aren't in the browser-readable `tasks`
 * collection (personal routines stay private), so My Tasks merges this in.
 */
export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id: subAccountId } = await ctx.params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;
  try {
    return NextResponse.json(
      await listRoutineActivities(subAccountId, { uid: access.uid, role: access.subAccountRole ?? null })
    );
  } catch (err) {
    return taskErrorResponse(err);
  }
}
