import "server-only";

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { createRoutine, listRoutines } from "@/lib/server/routines-service";
import { readJson, taskErrorResponse } from "@/lib/server/task-route-helpers";

/** Routines library: list (with this week's progress + read-only project routines) and create. */
export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id: subAccountId } = await ctx.params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;
  try {
    return NextResponse.json(await listRoutines(subAccountId, { uid: access.uid, role: access.subAccountRole ?? null }));
  } catch (err) {
    return taskErrorResponse(err);
  }
}

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id: subAccountId } = await ctx.params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;
  const body = await readJson(request);
  if (body instanceof NextResponse) return body;
  const sub = await getAdminDb().doc(`subAccounts/${subAccountId}`).get();
  try {
    const routine = await createRoutine({
      subAccountId,
      agencyId: (sub.data()?.agencyId as string) ?? access.agencyId ?? "",
      viewer: { uid: access.uid, role: access.subAccountRole ?? null },
      body,
    });
    return NextResponse.json({ routine }, { status: 201 });
  } catch (err) {
    return taskErrorResponse(err);
  }
}
