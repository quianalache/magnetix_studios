import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { getAdminDb } from "@/lib/firebase/admin";
import { createGoal, listGoals } from "@/lib/server/growth-service";
import type { GoalStatus } from "@/types/growth";

export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: subAccountId } = await ctx.params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const goals = await listGoals(
    subAccountId,
    status === "active" || status === "completed" ? (status as GoalStatus) : undefined,
  );
  return NextResponse.json({ ok: true, goals });
}

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: subAccountId } = await ctx.params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 200) : "";
  const target = typeof body.target === "number" && Number.isFinite(body.target) ? body.target : NaN;
  if (!name || Number.isNaN(target)) {
    return NextResponse.json({ error: "name and target are required" }, { status: 400 });
  }
  const parseDate = (v: unknown): Date | null => {
    if (typeof v !== "string" || !v) return null;
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  };

  const subSnap = await getAdminDb().doc(`subAccounts/${subAccountId}`).get();
  const agencyId = (subSnap.data()?.agencyId as string) ?? access.agencyId ?? "";

  const goal = await createGoal({
    agencyId,
    subAccountId,
    name,
    type: typeof body.type === "string" ? body.type.trim().slice(0, 100) : "Custom",
    current: typeof body.current === "number" && Number.isFinite(body.current) ? body.current : 0,
    target,
    startAt: parseDate(body.startAt),
    endAt: parseDate(body.endAt),
  });
  return NextResponse.json({ ok: true, goal }, { status: 201 });
}
