import "server-only";

import { NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { mutateMilestones } from "@/lib/server/project-generation-service";
import { parseDate, TaskInputError } from "@/lib/server/project-tasks-service";
import { toJson } from "@/lib/server/task-serialize";
import { readJson, taskErrorResponse } from "@/lib/server/task-route-helpers";

/** Edit / complete (PATCH) or remove (DELETE) one milestone. */
export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string; projectId: string; milestoneId: string }> }
) {
  const { id: subAccountId, projectId, milestoneId } = await ctx.params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;
  const body = await readJson(request);
  if (body instanceof NextResponse) return body;
  let summary = "Updated a milestone";
  try {
    const list = await mutateMilestones(
      projectId,
      subAccountId,
      (l) => {
        const i = l.findIndex((m) => m.id === milestoneId);
        if (i === -1) throw new TaskInputError("Milestone not found", 404);
        const m = { ...l[i] };
        if (typeof body.title === "string" && body.title.trim()) m.title = body.title.trim().slice(0, 200);
        if (body.dueAt !== undefined) {
          const d = body.dueAt === null ? null : parseDate(body.dueAt);
          m.dueAt = d ? Timestamp.fromDate(d) : null;
        }
        if (typeof body.completed === "boolean") {
          m.completedAt = body.completed ? Timestamp.now() : null;
          summary = body.completed ? `Completed milestone “${m.title}”` : `Reopened milestone “${m.title}”`;
        }
        l[i] = m;
        return l;
      },
      { uid: access.uid, get summary() { return summary; } }
    );
    return NextResponse.json({ milestones: toJson(list) });
  } catch (err) {
    return taskErrorResponse(err);
  }
}

export async function DELETE(
  request: Request,
  ctx: { params: Promise<{ id: string; projectId: string; milestoneId: string }> }
) {
  const { id: subAccountId, projectId, milestoneId } = await ctx.params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;
  let title = "";
  try {
    const list = await mutateMilestones(
      projectId,
      subAccountId,
      (l) => {
        title = l.find((m) => m.id === milestoneId)?.title ?? "";
        return l.filter((m) => m.id !== milestoneId);
      },
      { uid: access.uid, get summary() { return `Removed milestone “${title}”`; } }
    );
    return NextResponse.json({ milestones: toJson(list) });
  } catch (err) {
    return taskErrorResponse(err);
  }
}
