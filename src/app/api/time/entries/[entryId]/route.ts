import "server-only";

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { parseDate } from "@/lib/server/project-tasks-service";
import { readJson, taskErrorResponse } from "@/lib/server/task-route-helpers";
import { reviseEntry } from "@/lib/server/time-tracking-service";

/**
 * Correct (PATCH) or delete (DELETE) one of the caller's OWN staff time
 * entries. The service refuses anyone else's entry — a business owner can
 * review client-reported time but never silently alter it. Every change
 * appends to the entry's revision history.
 */
async function guard(request: Request, entryId: string) {
  const snap = await getAdminDb().doc(`timeEntries/${entryId}`).get();
  if (!snap.exists) {
    return NextResponse.json({ error: "Time entry not found" }, { status: 404 });
  }
  const access = await requireSubAccountMember(request, snap.data()!.subAccountId);
  if (access instanceof NextResponse) return access;
  return { access, subAccountId: snap.data()!.subAccountId as string };
}

export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ entryId: string }> }
) {
  const { entryId } = await ctx.params;
  const g = await guard(request, entryId);
  if (g instanceof NextResponse) return g;
  const body = await readJson(request);
  if (body instanceof NextResponse) return body;
  try {
    await reviseEntry({
      actor: { kind: "staff", uid: g.access.uid },
      entryId,
      action: "edit",
      subAccountId: g.subAccountId,
      startedAt: parseDate(body.startedAt) ?? undefined,
      durationSeconds:
        body.durationSeconds !== undefined ? Number(body.durationSeconds) : undefined,
      note: typeof body.note === "string" ? body.note : undefined,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return taskErrorResponse(err);
  }
}

export async function DELETE(
  request: Request,
  ctx: { params: Promise<{ entryId: string }> }
) {
  const { entryId } = await ctx.params;
  const g = await guard(request, entryId);
  if (g instanceof NextResponse) return g;
  try {
    await reviseEntry({
      actor: { kind: "staff", uid: g.access.uid },
      entryId,
      action: "delete",
      subAccountId: g.subAccountId,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return taskErrorResponse(err);
  }
}
