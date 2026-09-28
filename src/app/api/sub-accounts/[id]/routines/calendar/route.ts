import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { routineCalendarEntries } from "@/lib/server/routines-service";
import { taskErrorResponse } from "@/lib/server/task-route-helpers";

/** Routine entries for the Calendar grid (?from&to, ≤ 62 days). Future dates are projected, not written. */
export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id: subAccountId } = await ctx.params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;
  const url = new URL(request.url);
  try {
    return NextResponse.json({
      entries: await routineCalendarEntries({
        subAccountId,
        from: url.searchParams.get("from"),
        to: url.searchParams.get("to"),
      }),
    });
  } catch (err) {
    return taskErrorResponse(err);
  }
}
