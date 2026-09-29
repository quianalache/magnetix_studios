import "server-only";

import { NextResponse } from "next/server";
import {
  requirePortalMember,
  requirePortalTask,
} from "@/lib/server/portal-tasks-service";
import { readJson, taskErrorResponse } from "@/lib/server/task-route-helpers";
import {
  getActiveTimer,
  startTimer,
  stopTimer,
} from "@/lib/server/time-tracking-service";

/** Client Portal: the client's own single timer. */
export async function POST(
  request: Request,
  ctx: { params: Promise<{ saId: string }> }
) {
  const { saId } = await ctx.params;
  const body = await readJson(request);
  if (body instanceof NextResponse) return body;
  try {
    if (body.action === "start") {
      const g = await requirePortalTask(saId, typeof body.taskId === "string" ? body.taskId : "");
      if (g instanceof NextResponse) return g;
      const actor = { kind: "client" as const, memberId: g.member.id, contactId: g.member.contactId ?? null };
      return NextResponse.json(
        await startTimer(actor, { id: body.taskId as string, ...g.task })
      );
    }
    const member = await requirePortalMember(saId);
    if (member instanceof NextResponse) return member;
    const actor = { kind: "client" as const, memberId: member.id, contactId: member.contactId ?? null };
    if (body.action === "stop") {
      return NextResponse.json({ stopped: await stopTimer(actor) });
    }
    if (body.action === "status") {
      return NextResponse.json({ timer: await getActiveTimer(actor) });
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return taskErrorResponse(err);
  }
}
