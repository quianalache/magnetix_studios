import "server-only";

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { generateProjectFromSystemTemplate } from "@/lib/server/project-generation-service";
import { parseDate } from "@/lib/server/project-tasks-service";
import { readJson, taskErrorResponse } from "@/lib/server/task-route-helpers";

/** Template Library → Generate Project for a recovered Momentum OS system template. */
export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id: subAccountId } = await ctx.params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;
  const body = await readJson(request);
  if (body instanceof NextResponse) return body;
  const startAt = parseDate(body.startAt);
  if (!startAt) {
    return NextResponse.json({ error: "Start date is required" }, { status: 400 });
  }
  const subSnap = await getAdminDb().doc(`subAccounts/${subAccountId}`).get();
  try {
    const result = await generateProjectFromSystemTemplate({
      subAccountId,
      agencyId: (subSnap.data()?.agencyId as string) ?? access.agencyId ?? "",
      createdByUid: access.uid,
      templateKey: typeof body.templateKey === "string" ? body.templateKey : "",
      title: typeof body.title === "string" ? body.title.trim().slice(0, 200) : "",
      startAt,
      endAt: parseDate(body.endAt),
      autoSchedule: body.autoSchedule !== false,
      includeRoutines: body.includeRoutines !== false,
      includeMilestones: body.includeMilestones !== false,
      assignedContactId:
        typeof body.assignedContactId === "string" && body.assignedContactId
          ? body.assignedContactId
          : null,
    });
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    return taskErrorResponse(err);
  }
}
