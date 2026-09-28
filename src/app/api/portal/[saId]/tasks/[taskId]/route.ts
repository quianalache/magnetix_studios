import "server-only";

import { NextResponse } from "next/server";
import { setTaskCompletedServerSide } from "@/lib/server/tasks-service";
import { deleteFullTask, updateFullTask } from "@/lib/server/project-tasks-service";
import {
  portalPermissions,
  requirePortalTask,
} from "@/lib/server/portal-tasks-service";
import { readJson, taskErrorResponse } from "@/lib/server/task-route-helpers";

/**
 * Client Portal task actions.
 * PATCH { completed } → only a task the client created or that's assigned
 *                       to them. Dependencies warn, never block.
 * PATCH { title, description, dueAt, priority, status, checklist }
 *                     → only the client's OWN tasks (business-owner tasks
 *                       can be completed, never substantially changed).
 * DELETE              → only the client's OWN tasks.
 */
export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ saId: string; taskId: string }> }
) {
  const { saId, taskId } = await ctx.params;
  const g = await requirePortalTask(saId, taskId);
  if (g instanceof NextResponse) return g;
  const body = await readJson(request);
  if (body instanceof NextResponse) return body;
  const perms = portalPermissions(g.task, g.member);
  const actor = {
    kind: "client" as const,
    memberId: g.member.id,
    contactId: g.member.contactId ?? null,
  };
  try {
    const { completed, ...rest } = body;
    let warnings: string[] = [];
    if (Object.keys(rest).length > 0) {
      if (!perms.canEdit) {
        return NextResponse.json(
          { error: "You can complete this task, but only your business can change it." },
          { status: 403 }
        );
      }
      const r = await updateFullTask({ taskId, task: g.task, actor, patch: rest, fromClient: true });
      warnings = r.warnings;
    }
    if (typeof completed === "boolean") {
      if (!perms.canComplete) {
        return NextResponse.json(
          { error: "Only tasks assigned to you or created by you can be completed here." },
          { status: 403 }
        );
      }
      const r = await setTaskCompletedServerSide({
        taskId,
        completed,
        userId: "",
        expectedSubAccountId: saId,
        actor,
      });
      warnings = [...warnings, ...(r?.warnings ?? [])];
    }
    return NextResponse.json({ ok: true, warnings });
  } catch (err) {
    return taskErrorResponse(err);
  }
}

export async function DELETE(
  _request: Request,
  ctx: { params: Promise<{ saId: string; taskId: string }> }
) {
  const { saId, taskId } = await ctx.params;
  const g = await requirePortalTask(saId, taskId);
  if (g instanceof NextResponse) return g;
  if (!portalPermissions(g.task, g.member).canEdit) {
    return NextResponse.json(
      { error: "Only tasks you created can be deleted." },
      { status: 403 }
    );
  }
  try {
    await deleteFullTask({
      taskId,
      task: g.task,
      actor: { kind: "client", memberId: g.member.id, contactId: g.member.contactId ?? null },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return taskErrorResponse(err);
  }
}
