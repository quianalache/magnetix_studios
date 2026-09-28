import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import {
  deleteRoutine,
  getRoutineDetail,
  setRoutineStatus,
  updateRoutine,
} from "@/lib/server/routines-service";
import { readJson, taskErrorResponse } from "@/lib/server/task-route-helpers";

type Ctx = { params: Promise<{ id: string; routineId: string }> };

/** Routine detail for a date range (?from=YYYY-MM-DD&to=YYYY-MM-DD, ≤ 62 days). */
export async function GET(request: Request, ctx: Ctx) {
  const { id: subAccountId, routineId } = await ctx.params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;
  const url = new URL(request.url);
  try {
    return NextResponse.json(
      await getRoutineDetail({
        subAccountId,
        routineId,
        from: url.searchParams.get("from"),
        to: url.searchParams.get("to"),
      })
    );
  } catch (err) {
    return taskErrorResponse(err);
  }
}

/** Edit the routine. A body of only `{status}` pauses / resumes it. */
export async function PATCH(request: Request, ctx: Ctx) {
  const { id: subAccountId, routineId } = await ctx.params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;
  const body = await readJson(request);
  if (body instanceof NextResponse) return body;
  try {
    const keys = Object.keys(body);
    const routine =
      keys.length === 1 && (body.status === "active" || body.status === "paused")
        ? await setRoutineStatus({ subAccountId, routineId, status: body.status })
        : await updateRoutine({ subAccountId, routineId, uid: access.uid, body });
    return NextResponse.json({ routine });
  } catch (err) {
    return taskErrorResponse(err);
  }
}

export async function DELETE(request: Request, ctx: Ctx) {
  const { id: subAccountId, routineId } = await ctx.params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;
  try {
    await deleteRoutine({ subAccountId, routineId });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return taskErrorResponse(err);
  }
}
