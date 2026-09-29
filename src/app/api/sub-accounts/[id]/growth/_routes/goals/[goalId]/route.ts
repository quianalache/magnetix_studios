import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { deleteGoal, updateGoal } from "@/lib/server/growth-service";

export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string; goalId: string }> },
) {
  const { id: subAccountId, goalId } = await ctx.params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parseDate = (v: unknown): Date | null => {
    if (typeof v !== "string" || !v) return null;
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  };

  const patch: Parameters<typeof updateGoal>[1] = {};
  if (typeof body.name === "string") patch.name = body.name.trim().slice(0, 200);
  if (typeof body.type === "string") patch.type = body.type.trim().slice(0, 100);
  if (typeof body.current === "number") patch.current = body.current;
  if (typeof body.target === "number") patch.target = body.target;
  if ("startAt" in body) patch.startAt = parseDate(body.startAt);
  if ("endAt" in body) patch.endAt = parseDate(body.endAt);
  if (body.status === "active" || body.status === "completed") patch.status = body.status;

  await updateGoal(goalId, patch);
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  request: Request,
  ctx: { params: Promise<{ id: string; goalId: string }> },
) {
  const { id: subAccountId, goalId } = await ctx.params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;
  await deleteGoal(goalId);
  return NextResponse.json({ ok: true });
}
