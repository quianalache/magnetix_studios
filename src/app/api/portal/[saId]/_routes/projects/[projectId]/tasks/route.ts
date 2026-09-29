import "server-only";

import { NextResponse } from "next/server";
import { createFullTask } from "@/lib/server/project-tasks-service";
import {
  requirePortalMember,
  requirePortalTaskProject,
} from "@/lib/server/portal-tasks-service";
import { readJson, taskErrorResponse } from "@/lib/server/task-route-helpers";

/** Client Portal: a client adds a task to a task-based project assigned to them. */
export async function POST(
  request: Request,
  ctx: { params: Promise<{ saId: string; projectId: string }> }
) {
  const { saId, projectId } = await ctx.params;
  const member = await requirePortalMember(saId);
  if (member instanceof NextResponse) return member;
  const project = await requirePortalTaskProject(saId, projectId, member);
  if (project instanceof NextResponse) return project;
  if (project.status !== "active") {
    return NextResponse.json({ error: "This project is archived." }, { status: 409 });
  }
  const body = await readJson(request);
  if (body instanceof NextResponse) return body;
  try {
    // Only client-safe fields are honored (createFullTask ignores the rest
    // for `fromClient`); the task is always client-visible and theirs.
    const id = await createFullTask({
      subAccountId: saId,
      agencyId: project.agencyId,
      actor: { kind: "client", memberId: member.id, contactId: member.contactId ?? null },
      createdByUid: "",
      body: {
        title: body.title,
        description: body.description,
        dueAt: body.dueAt,
        priority: body.priority,
        projectId,
        parentTaskId: body.parentTaskId,
      },
      fromClient: { memberId: member.id, contactId: member.contactId! },
    });
    return NextResponse.json({ id }, { status: 201 });
  } catch (err) {
    return taskErrorResponse(err);
  }
}
