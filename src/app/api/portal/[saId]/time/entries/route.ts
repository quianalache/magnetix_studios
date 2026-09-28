import "server-only";

import { NextResponse } from "next/server";
import { parseDate } from "@/lib/server/project-tasks-service";
import { requirePortalTask } from "@/lib/server/portal-tasks-service";
import { readJson, taskErrorResponse } from "@/lib/server/task-route-helpers";
import {
  actorKeyOf,
  addManualEntry,
  listEntriesForTask,
} from "@/lib/server/time-tracking-service";

/**
 * Client Portal time entries. GET ?taskId= → the client's OWN entries on
 * that task (never staff time or other clients'). POST → manual entry.
 */
export async function GET(
  request: Request,
  ctx: { params: Promise<{ saId: string }> }
) {
  const { saId } = await ctx.params;
  const taskId = new URL(request.url).searchParams.get("taskId") ?? "";
  const g = await requirePortalTask(saId, taskId);
  if (g instanceof NextResponse) return g;
  const key = actorKeyOf({ kind: "client", memberId: g.member.id, contactId: g.member.contactId ?? null });
  const entries = await listEntriesForTask({ taskId, subAccountId: saId, viewerKey: key, onlyActorKey: key });
  return NextResponse.json({ entries });
}

export async function POST(
  request: Request,
  ctx: { params: Promise<{ saId: string }> }
) {
  const { saId } = await ctx.params;
  const body = await readJson(request);
  if (body instanceof NextResponse) return body;
  const taskId = typeof body.taskId === "string" ? body.taskId : "";
  const g = await requirePortalTask(saId, taskId);
  if (g instanceof NextResponse) return g;
  try {
    const result = await addManualEntry({
      actor: { kind: "client", memberId: g.member.id, contactId: g.member.contactId ?? null },
      task: { id: taskId, ...g.task },
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
