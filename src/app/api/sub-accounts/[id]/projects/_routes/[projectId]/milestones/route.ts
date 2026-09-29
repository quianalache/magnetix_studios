import "server-only";

import { NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import {
  mutateMilestones,
  newMilestoneId,
} from "@/lib/server/project-generation-service";
import { parseDate } from "@/lib/server/project-tasks-service";
import { toJson } from "@/lib/server/task-serialize";
import { readJson, taskErrorResponse } from "@/lib/server/task-route-helpers";

/** Add a milestone to a project (staff). Milestones on client projects are shown to that client. */
export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string; projectId: string }> }
) {
  const { id: subAccountId, projectId } = await ctx.params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;
  const body = await readJson(request);
  if (body instanceof NextResponse) return body;
  const title = typeof body.title === "string" ? body.title.trim().slice(0, 200) : "";
  if (!title) return NextResponse.json({ error: "Title is required" }, { status: 400 });
  const due = parseDate(body.dueAt);
  try {
    const list = await mutateMilestones(
      projectId,
      subAccountId,
      (l) => [
        ...l,
        {
          id: newMilestoneId(),
          title,
          dueAt: due ? Timestamp.fromDate(due) : null,
          offsetLabel: null,
          completedAt: null,
        },
      ],
      { uid: access.uid, summary: `Added milestone “${title}”` }
    );
    return NextResponse.json({ milestones: toJson(list) }, { status: 201 });
  } catch (err) {
    return taskErrorResponse(err);
  }
}
