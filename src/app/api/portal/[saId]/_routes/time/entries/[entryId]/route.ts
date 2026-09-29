import "server-only";

import { NextResponse } from "next/server";
import { parseDate } from "@/lib/server/project-tasks-service";
import { requirePortalMember } from "@/lib/server/portal-tasks-service";
import { readJson, taskErrorResponse } from "@/lib/server/task-route-helpers";
import { reviseEntry } from "@/lib/server/time-tracking-service";

/** Client Portal: correct (PATCH) or delete (DELETE) the client's OWN time entry — audited. */
export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ saId: string; entryId: string }> }
) {
  const { saId, entryId } = await ctx.params;
  const member = await requirePortalMember(saId);
  if (member instanceof NextResponse) return member;
  const body = await readJson(request);
  if (body instanceof NextResponse) return body;
  try {
    await reviseEntry({
      actor: { kind: "client", memberId: member.id, contactId: member.contactId ?? null },
      entryId,
      action: "edit",
      subAccountId: saId,
      startedAt: parseDate(body.startedAt) ?? undefined,
      durationSeconds: body.durationSeconds !== undefined ? Number(body.durationSeconds) : undefined,
      note: typeof body.note === "string" ? body.note : undefined,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return taskErrorResponse(err);
  }
}

export async function DELETE(
  _request: Request,
  ctx: { params: Promise<{ saId: string; entryId: string }> }
) {
  const { saId, entryId } = await ctx.params;
  const member = await requirePortalMember(saId);
  if (member instanceof NextResponse) return member;
  try {
    await reviseEntry({
      actor: { kind: "client", memberId: member.id, contactId: member.contactId ?? null },
      entryId,
      action: "delete",
      subAccountId: saId,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return taskErrorResponse(err);
  }
}
