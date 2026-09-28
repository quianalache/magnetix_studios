import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import {
  completeRoutineDate,
  setRoutineActivityCompleted,
} from "@/lib/server/routines-service";
import { readJson, taskErrorResponse } from "@/lib/server/task-route-helpers";

/**
 * Check off one activity for one date (`{date, activityId, completed}`), or
 * every open activity of that date (`{date}` = "Mark All Complete"). Only
 * that date's tasks change — other occurrences are separate records.
 */
export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string; routineId: string }> }
) {
  const { id: subAccountId, routineId } = await ctx.params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;
  const body = await readJson(request);
  if (body instanceof NextResponse) return body;
  const actor = { kind: "staff" as const, uid: access.uid };
  try {
    if (typeof body.activityId === "string") {
      return NextResponse.json(
        await setRoutineActivityCompleted({
          subAccountId,
          routineId,
          date: body.date,
          activityId: body.activityId,
          completed: body.completed !== false,
          actor,
        })
      );
    }
    return NextResponse.json(await completeRoutineDate({ subAccountId, routineId, date: body.date, actor }));
  } catch (err) {
    return taskErrorResponse(err);
  }
}
