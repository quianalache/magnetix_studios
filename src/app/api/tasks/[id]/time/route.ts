import "server-only";

import { NextResponse } from "next/server";
import { requireTaskAccess, parseDate } from "@/lib/server/project-tasks-service";
import { readJson, taskErrorResponse } from "@/lib/server/task-route-helpers";
import {
  actorKeyOf,
  addManualEntry,
  listEntriesForTask,
} from "@/lib/server/time-tracking-service";

/** Staff time on one task: GET the entries (clients' shown read-only), POST a manual entry. */
export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const guard = await requireTaskAccess(request, id);
  if (guard instanceof NextResponse) return guard;
  const entries = await listEntriesForTask({
    taskId: id,
    subAccountId: guard.task.subAccountId,
    viewerKey: actorKeyOf({ kind: "staff", uid: guard.access.uid }),
  });
  return NextResponse.json({ entries });
}

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const guard = await requireTaskAccess(request, id);
  if (guard instanceof NextResponse) return guard;
  const body = await readJson(request);
  if (body instanceof NextResponse) return body;
  try {
    const result = await addManualEntry({
      actor: { kind: "staff", uid: guard.access.uid },
      task: { id, ...guard.task },
      startedAt: parseDate(body.startedAt) ?? new Date(),
      durationSeconds: Number(body.durationSeconds),
      note: typeof body.note === "string" ? body.note : "",
      requestId: typeof body.requestId === "string" ? body.requestId : "",
    });
    return NextResponse.json(result, { status: result.duplicate ? 200 : 201 });
  } catch (err) {
    return taskErrorResponse(err);
  }
}
